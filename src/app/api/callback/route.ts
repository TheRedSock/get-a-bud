import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { ingestionConnections, syncRuns } from "@/db/schema";
import { inngest } from "@/inngest/client";
import { EnableBankingClient } from "@/lib/ingestion/enable-banking/client";
import {
  hashAuthorizationState,
  safeCompareStateHash,
} from "@/lib/ingestion/enable-banking/state";
import { decryptSecret } from "@/lib/security/encryption";

function getPrivateKey(connection: typeof ingestionConnections.$inferSelect) {
  if (
    !connection.encryptedPrivateKey ||
    !connection.encryptedPrivateKeyIv ||
    !connection.encryptedPrivateKeyTag
  ) {
    throw new Error("Enable Banking private key is missing");
  }

  return decryptSecret({
    ciphertext: connection.encryptedPrivateKey,
    iv: connection.encryptedPrivateKeyIv,
    tag: connection.encryptedPrivateKeyTag,
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
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
      .where(eq(ingestionConnections.id, connection.id));

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
      .where(eq(ingestionConnections.id, connection.id));

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
    baseUrl: process.env.ENABLE_BANKING_BASE_URL,
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
          authorizedAccounts: session.accounts?.map((account) => ({
            uid: account.uid,
            identificationHash: account.identification_hash,
            name: account.name,
            details: account.details,
            currency: account.currency,
          })),
        },
        updatedAt: new Date(),
      })
      .where(eq(ingestionConnections.id, connection.id));

    const [run] = await db
      .insert(syncRuns)
      .values({
        connectionId: connection.id,
        provider: "enable_banking",
        status: "queued",
      })
      .returning();

    try {
      await inngest.send({
        name: "bank.connection.sync",
        data: { connectionId: connection.id, runId: run.id },
      });
    } catch (queueError) {
      const message =
        queueError instanceof Error ? queueError.message : "Could not queue sync";

      console.error("Enable Banking initial sync queue failed", {
        connectionId: connection.id,
        runId: run.id,
        error: queueError,
      });

      await db
        .update(syncRuns)
        .set({
          status: "failed",
          finishedAt: new Date(),
          errorMessage: message,
        })
        .where(eq(syncRuns.id, run.id));
    }

    return NextResponse.redirect(
      new URL(
        `/settings/integrations?enable_banking=connected&sync_run=${run.id}`,
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
            message:
              sessionError instanceof Error
                ? sessionError.message
                : "Unknown session error",
            at: new Date().toISOString(),
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(ingestionConnections.id, connection.id));

    return NextResponse.redirect(
      new URL("/settings/integrations?enable_banking=session_failed", url.origin),
    );
  }
}
