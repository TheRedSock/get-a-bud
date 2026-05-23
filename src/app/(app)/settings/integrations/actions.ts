"use server";

import { and, desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";

import { serverEnv } from "@/config/env";
import { db } from "@/db";
import { ingestionConnections, syncRuns } from "@/db/schema";
import { EVENT_NAMES } from "@/inngest/lib/events";
import { sendInngestEvent } from "@/inngest/lib/send-event";
import {
  authenticatedAction,
  validateActionInput,
} from "@/lib/actions/safe-action";
import {
  configurationError,
  notFoundError,
  providerError,
  rateLimitedError,
  validationError,
} from "@/lib/errors/catalog";
import {
  enforceActionRateLimit,
  integrationAuthRateLimit,
  queueEnqueueRateLimit,
} from "@/lib/security/arcjet";
import { EnableBankingClient } from "@/lib/ingestion/enable-banking/client";
import { resolvePipelineRunForSlot } from "@/lib/ingestion/pipeline/runs";
import { resolveSyncRunForEnqueue } from "@/lib/ingestion/sync-runs";
import { capturePsuHeaders } from "@/lib/ingestion/enable-banking/psu-headers";
import {
  createAuthorizationState,
  getAppUrl,
} from "@/lib/ingestion/enable-banking/state";
// Step-up auth deferred until client-side confirmation dialog is built.
// Re-enable: import { requireStepUp } from "@/lib/auth/step-up";
// Then add `await requireStepUp(ctx.user.id);` after rate limit in:
//   createEnableBankingConnection, startEnableBankingAuth, queueEnableBankingSync
import { encryptSecret, decryptSecret } from "@/lib/security/encryption";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const connectionSchema = z.object({
  displayName: z.string().min(1).max(120).default("Enable Banking"),
  applicationId: z.string().min(1),
  pemPrivateKey: z.string().min(100),
});

const startAuthorizationSchema = z.object({
  connectionId: z.string().min(1),
  aspspName: z.string().min(1).max(120),
  aspspCountry: z.string().length(2).transform((value) => value.toUpperCase()),
  psuType: z.enum(["personal", "business"]).optional(),
  authMethod: z.string().min(1).optional(),
  language: z.string().min(2).max(8).optional(),
  validDays: z.coerce.number().int().min(1).max(180).default(90),
});

const queueSyncSchema = z.object({
  connectionId: z.string().min(1),
});

// ---------------------------------------------------------------------------
// createEnableBankingConnection
// ---------------------------------------------------------------------------

export const createEnableBankingConnection = authenticatedAction(
  "enableBanking.connections.create",
  async (ctx, input: unknown) => {
    await enforceActionRateLimit(integrationAuthRateLimit, ctx.user.id);
    // await requireStepUp(ctx.user.id); // Deferred: needs step-up confirmation dialog

    const validated = validateActionInput(
      connectionSchema,
      input,
      "Please provide an Enable Banking application ID and PEM private key.",
    );
    if (validated.error) throw validationError(validated.error.message, { fieldErrors: validated.error.fieldErrors });
    const connectionInput = validated.data;

    const encrypted = encryptSecret(connectionInput.pemPrivateKey);

    const [connection] = await db
      .insert(ingestionConnections)
      .values({
        householdId: ctx.householdId,
        provider: "enable_banking",
        displayName: connectionInput.displayName,
        externalApplicationId: connectionInput.applicationId,
        encryptedPrivateKey: encrypted.ciphertext,
        encryptedPrivateKeyIv: encrypted.iv,
        encryptedPrivateKeyTag: encrypted.tag,
        status: "needs_authorization",
        metadata: {
          credentialsUpdatedAt: new Date().toISOString(),
        },
      })
      .returning();

    return { connection: { id: connection.id } };
  },
);

// ---------------------------------------------------------------------------
// startEnableBankingAuth
// ---------------------------------------------------------------------------

export const startEnableBankingAuth = authenticatedAction(
  "enableBanking.authorization.start",
  async (ctx, input: unknown) => {
    await enforceActionRateLimit(integrationAuthRateLimit, ctx.user.id);
    // await requireStepUp(ctx.user.id); // Deferred: needs step-up confirmation dialog

    const validated = validateActionInput(
      startAuthorizationSchema,
      input,
      "Please provide a valid bank name, country and consent duration.",
    );
    if (validated.error) throw validationError(validated.error.message, { fieldErrors: validated.error.fieldErrors });
    const authInput = validated.data;

    const [connection] = await db
      .select()
      .from(ingestionConnections)
      .where(
        and(
          eq(ingestionConnections.id, authInput.connectionId),
          eq(ingestionConnections.householdId, ctx.householdId),
        ),
      )
      .limit(1);

    if (!connection) {
      throw notFoundError("Enable Banking connection not found.", {
        connectionId: authInput.connectionId,
      });
    }

    if (!connection.externalApplicationId) {
      throw validationError("Enable Banking application ID is missing.", {
        fieldErrors: {
          applicationId: ["Save an Enable Banking application ID before authorizing."],
        },
      });
    }

    // Get browser headers for PSU compliance
    const headerMap = await headers();
    const psuHeaders = capturePsuHeaders(headerMap);

    const { state, stateHash, expiresAt } = createAuthorizationState();
    const validUntil = new Date(
      Date.now() + authInput.validDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    // Resolve PEM key
    if (
      !connection.encryptedPrivateKey ||
      !connection.encryptedPrivateKeyIv ||
      !connection.encryptedPrivateKeyTag
    ) {
      throw configurationError("Enable Banking private key is missing", {
        context: { connectionId: connection.id },
      });
    }
    const pemPrivateKey = decryptSecret({
      ciphertext: connection.encryptedPrivateKey,
      iv: connection.encryptedPrivateKeyIv,
      tag: connection.encryptedPrivateKeyTag,
    });

    // Derive app URL from referer or host header
    const referer = headerMap.get("referer");
    const host = headerMap.get("host");
    const appUrl = referer
      ? new URL(referer).origin
      : host
        ? `https://${host}`
        : getAppUrl("");

    let authorization: Awaited<ReturnType<EnableBankingClient["startAuthorization"]>>;

    try {
      const client = new EnableBankingClient({
        applicationId: connection.externalApplicationId,
        pemPrivateKey,
        baseUrl: serverEnv.ENABLE_BANKING_BASE_URL,
      });

      authorization = await client.startAuthorization({
        access: {
          validUntil,
          balances: true,
          transactions: true,
        },
        aspsp: {
          name: authInput.aspspName,
          country: authInput.aspspCountry,
        },
        state,
        redirectUrl: `${appUrl}/api/callback`,
        psuType: authInput.psuType,
        authMethod: authInput.authMethod,
        language: authInput.language,
        psuHeaders,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not start Enable Banking authorization";

      if (
        connection.status === "needs_authorization" &&
        !connection.authorizationId &&
        !connection.consentSessionId
      ) {
        await db
          .delete(ingestionConnections)
          .where(
            and(
              eq(ingestionConnections.id, connection.id),
              eq(ingestionConnections.householdId, ctx.householdId),
            ),
          );
      } else {
        await db
          .update(ingestionConnections)
          .set({
            status: "authorization_failed",
            metadata: {
              ...(connection.metadata ?? {}),
              lastAuthorizationError: {
                code: "authorization_start_failed",
                at: new Date().toISOString(),
              },
            },
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(ingestionConnections.id, connection.id),
              eq(ingestionConnections.householdId, ctx.householdId),
            ),
          );
      }

      throw providerError(message, {
        cause: error,
        status: 400,
        userMessage:
          "Could not start authorization with that bank. Check the bank name and country, then try again.",
        context: { connectionId: connection.id, provider: "enable_banking" },
      });
    }

    const metadata = {
      ...(connection.metadata ?? {}),
      psuHeaders,
      pendingAuthorization: {
        aspsp: {
          name: authInput.aspspName,
          country: authInput.aspspCountry,
        },
        access: {
          validUntil,
          balances: true,
          transactions: true,
        },
        psuType: authInput.psuType,
        language: authInput.language,
        psuIdHash: authorization.psu_id_hash,
        startedAt: new Date().toISOString(),
      },
    };

    await db
      .update(ingestionConnections)
      .set({
        authorizationId: authorization.authorization_id,
        authorizationStateHash: stateHash,
        authorizationStateExpiresAt: expiresAt,
        status: "awaiting_consent",
        metadata,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(ingestionConnections.id, connection.id),
          eq(ingestionConnections.householdId, ctx.householdId),
        ),
      );

    return {
      authorizationId: authorization.authorization_id,
      redirectUrl: authorization.url,
      expiresAt,
    };
  },
);

// ---------------------------------------------------------------------------
// queueEnableBankingSync
// ---------------------------------------------------------------------------

export const queueEnableBankingSync = authenticatedAction(
  "enableBanking.sync.queue",
  async (ctx, input: unknown) => {
    await enforceActionRateLimit(queueEnqueueRateLimit, ctx.user.id);
    // await requireStepUp(ctx.user.id); // Deferred: needs step-up confirmation dialog

    const validated = validateActionInput(
      queueSyncSchema,
      input,
      "Please provide a valid connection ID.",
    );
    if (validated.error) throw validationError(validated.error.message, { fieldErrors: validated.error.fieldErrors });
    const { connectionId } = validated.data;

    const [connection] = await db
      .select({
        id: ingestionConnections.id,
        consentSessionId: ingestionConnections.consentSessionId,
      })
      .from(ingestionConnections)
      .where(
        and(
          eq(ingestionConnections.id, connectionId),
          eq(ingestionConnections.householdId, ctx.householdId),
        ),
      )
      .limit(1);

    if (!connection) {
      throw notFoundError("Enable Banking connection not found.", { connectionId });
    }

    if (!connection.consentSessionId) {
      throw validationError("Bank authorization is not complete yet.", {
        fieldErrors: {
          connection: ["Finish bank authorization before starting a sync."],
        },
      });
    }

    const run = await resolveSyncRunForEnqueue({ connectionId });

    const pipelineRun = await resolvePipelineRunForSlot({
      householdId: ctx.householdId,
      kind: "full_post_sync",
      connectionId,
      syncRunId: run.id,
    });

    try {
      await sendInngestEvent(EVENT_NAMES.bankConnectionSync, {
        connectionId,
        runId: run.id,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not queue bank sync";

      await db
        .update(syncRuns)
        .set({
          status: "failed",
          finishedAt: new Date(),
          errorMessage: message,
        })
        .where(eq(syncRuns.id, run.id));

      throw providerError(message, {
        cause: error,
        userMessage:
          "The bank sync could not be queued. Please try again in a moment.",
        context: { connectionId, runId: run.id },
        status: 500,
      });
    }

    return {
      run: { id: run.id, status: "queued" as const },
      pipelineRunId: pipelineRun.id,
    };
  },
);
