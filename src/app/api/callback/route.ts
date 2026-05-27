import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { serverEnv } from "@/config/env";
import { db } from "@/db";
import { ingestionConnections, syncRuns } from "@/db/schema";
import { EVENT_NAMES } from "@/inngest/lib/events";
import { sendInngestEvent } from "@/inngest/lib/send-event";
import { EnableBankingClient } from "@/lib/ingestion/enable-banking/client";
import { resolveSyncRunForEnqueue } from "@/lib/ingestion/sync-runs";
import {
  hashAuthorizationState,
  safeCompareStateHash,
} from "@/lib/ingestion/enable-banking/state";
import { isAppError } from "@/lib/errors/app-error";
import { configurationError, providerError } from "@/lib/errors/catalog";
import { logger } from "@/lib/logger";
import { decryptSecret } from "@/lib/security/encryption";
import { enforceRateLimit } from "@/lib/security/rate-limit";

function getPrivateKey(connection: typeof ingestionConnections.$inferSelect) {
  if (
    !connection.encryptedPrivateKey ||
    !connection.encryptedPrivateKeyIv ||
    !connection.encryptedPrivateKeyTag
  ) {
    throw configurationError("Enable Banking private key is missing", {
      context: { connectionId: connection.id },
    });
  }

  return decryptSecret({
    ciphertext: connection.encryptedPrivateKey,
    iv: connection.encryptedPrivateKeyIv,
    tag: connection.encryptedPrivateKeyTag,
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  try {
    await enforceRateLimit("integrationAuth", { headers: request.headers });
  } catch (error) {
    if (isAppError(error) && error.code === "rate_limited") {
      return NextResponse.redirect(
        new URL("/settings/integrations?enable_banking=rate_limited", url.origin),
      );
    }
    // Fail open on rate limit infrastructure errors (local dev, missing Redis)
  }

  try {
    return await handleCallback(request, url);
  } catch (error) {
    // Top-level safety net: redirect to error state for unexpected failures
    logger.exception(
      providerError(
        error instanceof Error ? error.message : "Unexpected callback error",
        {
          cause: error,
          userMessage: "An unexpected error occurred during bank connection.",
          status: 500,
        },
      ),
    );

    return NextResponse.redirect(
      new URL("/settings/integrations?enable_banking=unexpected_error", url.origin),
    );
  }
}

async function handleCallback(request: Request, url: URL) {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  if (!state) {
    return NextResponse.redirect(
      new URL("/settings/integrations?enable_banking=missing_state", url.origin),
    );
  }

  const stateHash = hashAuthorizationState(state);
  const [connection] = await db
    .select()
    .from(ingestionConnections)
    .where(eq(ingestionConnections.authorizationStateHash, stateHash))
    .limit(1);

  if (
    !connection?.authorizationStateHash ||
    !safeCompareStateHash(state, connection.authorizationStateHash)
  ) {
    return NextResponse.redirect(
      new URL("/settings/integrations?enable_banking=invalid_state", url.origin),
    );
  }

  if (
    connection.authorizationStateExpiresAt &&
    connection.authorizationStateExpiresAt < new Date()
  ) {
    await db
      .update(ingestionConnections)
      .set({
        status: "authorization_expired",
        authorizationStateHash: null,
        authorizationStateExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(ingestionConnections.id, connection.id),
          eq(ingestionConnections.householdId, connection.householdId),
        ),
      );

    return NextResponse.redirect(
      new URL("/settings/integrations?enable_banking=expired", url.origin),
    );
  }

  if (error) {
    await db
      .update(ingestionConnections)
      .set({
        status: "authorization_failed",
        authorizationStateHash: null,
        authorizationStateExpiresAt: null,
        metadata: {
          ...(connection.metadata ?? {}),
          lastAuthorizationError: {
            error,
            description: errorDescription,
            at: new Date().toISOString(),
          },
        },
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(ingestionConnections.id, connection.id),
          eq(ingestionConnections.householdId, connection.householdId),
        ),
      );

    return NextResponse.redirect(
      new URL("/settings/integrations?enable_banking=denied", url.origin),
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/settings/integrations?enable_banking=missing_code", url.origin),
    );
  }

  if (!connection.externalApplicationId) {
    return NextResponse.redirect(
      new URL("/settings/integrations?enable_banking=missing_app_id", url.origin),
    );
  }

  const client = new EnableBankingClient({
    applicationId: connection.externalApplicationId,
    pemPrivateKey: getPrivateKey(connection),
    baseUrl: serverEnv.ENABLE_BANKING_BASE_URL,
  });

  try {
    const session = await client.authorizeSession(code);
    const consentExpiresAt = session.access?.valid_until
      ? new Date(session.access.valid_until)
      : null;

    await db
      .update(ingestionConnections)
      .set({
        consentSessionId: session.session_id,
        authorizationStateHash: null,
        authorizationStateExpiresAt: null,
        consentExpiresAt,
        status: "connected",
        metadata: {
          ...(connection.metadata ?? {}),
          lastAuthorizedAt: new Date().toISOString(),
          aspsp: session.aspsp,
          psuType: session.psu_type,
          authorizedAccounts: session.accounts?.map((account) =>
            typeof account === "string"
              ? { uid: account }
              : {
                  uid: account.uid,
                  identificationHash: account.identification_hash,
                  name: account.name,
                  details: account.details,
                  currency: account.currency,
                },
          ),
        },
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(ingestionConnections.id, connection.id),
          eq(ingestionConnections.householdId, connection.householdId),
        ),
      );

    const run = await resolveSyncRunForEnqueue({
      connectionId: connection.id,
    });

    let syncQueued = true;

    try {
      await sendInngestEvent(EVENT_NAMES.bankConnectionSync, {
        connectionId: connection.id,
        runId: run.id,
      });
    } catch (queueError) {
      const message =
        queueError instanceof Error ? queueError.message : "Could not queue sync";

      await db
        .update(syncRuns)
        .set({
          status: "failed",
          finishedAt: new Date(),
          errorMessage: message,
        })
        .where(eq(syncRuns.id, run.id));

      syncQueued = false;
      logger.exception(
        providerError(message, {
          cause: queueError,
          userMessage:
            "The bank was connected, but the initial sync could not be queued.",
          context: { connectionId: connection.id, runId: run.id },
          status: 500,
        }),
      );
    }

    return NextResponse.redirect(
      new URL(
        `/settings/integrations?enable_banking=${
          syncQueued ? "connected" : "connected_sync_failed"
        }&sync_run=${run.id}`,
        url.origin,
      ),
    );
  } catch (sessionError) {
    await db
      .update(ingestionConnections)
      .set({
        status: "session_failed",
        authorizationStateHash: null,
        authorizationStateExpiresAt: null,
        metadata: {
          ...(connection.metadata ?? {}),
          lastSessionError: {
            code: "session_exchange_failed",
            at: new Date().toISOString(),
          },
        },
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(ingestionConnections.id, connection.id),
          eq(ingestionConnections.householdId, connection.householdId),
        ),
      );

    logger.exception(
      providerError(
        sessionError instanceof Error
          ? sessionError.message
          : "Unknown Enable Banking session exchange error",
        {
          cause: sessionError,
          userMessage: "The bank redirect succeeded, but the session exchange failed.",
          context: { connectionId: connection.id },
          status: 502,
        },
      ),
    );

    return NextResponse.redirect(
      new URL("/settings/integrations?enable_banking=session_failed", url.origin),
    );
  }
}
