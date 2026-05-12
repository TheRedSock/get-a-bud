import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { ingestionConnections } from "@/db/schema";
import { validateJsonBody, withApiHandler } from "@/lib/errors/api";
import {
  configurationError,
  notFoundError,
  providerError,
  rateLimitedError,
  validationError,
} from "@/lib/errors/catalog";
import { getActiveHousehold } from "@/lib/finance/household";
import { EnableBankingClient } from "@/lib/ingestion/enable-banking/client";
import { capturePsuHeaders } from "@/lib/ingestion/enable-banking/psu-headers";
import {
  createAuthorizationState,
  getAppUrl,
} from "@/lib/ingestion/enable-banking/state";
import { integrationAuthRateLimit } from "@/lib/security/arcjet";
import { decryptSecret } from "@/lib/security/encryption";

const startAuthorizationSchema = z.object({
  aspspName: z.string().min(1).max(120),
  aspspCountry: z.string().length(2).transform((value) => value.toUpperCase()),
  psuType: z.enum(["personal", "business"]).optional(),
  authMethod: z.string().min(1).optional(),
  language: z.string().min(2).max(8).optional(),
  validDays: z.coerce.number().int().min(1).max(180).default(90),
});

function decryptConnectionPrivateKey(
  connection: typeof ingestionConnections.$inferSelect,
) {
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

export const POST = withApiHandler(
  "enableBanking.authorization.start",
  async (
    request: Request,
    { params }: { params: Promise<{ connectionId: string }> },
  ) => {
    const decision = await integrationAuthRateLimit.protect(request);
    if (decision.isDenied()) {
      throw rateLimitedError(
        "Too many authorization attempts. Please wait a minute before trying again.",
      );
    }

    const { connectionId } = await params;
    const household = await getActiveHousehold();
    const authorizationInput = await validateJsonBody(
      request,
      startAuthorizationSchema,
      "Please provide a valid bank name, country and consent duration.",
    );

  const [connection] = await db
    .select()
    .from(ingestionConnections)
    .where(
      and(
        eq(ingestionConnections.id, connectionId),
        eq(ingestionConnections.householdId, household.householdId),
      ),
    )
    .limit(1);

  if (!connection) {
    throw notFoundError("Enable Banking connection not found.", { connectionId });
  }

  if (!connection.externalApplicationId) {
    throw validationError("Enable Banking application ID is missing.", {
      fieldErrors: {
        applicationId: ["Save an Enable Banking application ID before authorizing."],
      },
      context: { connectionId },
    });
  }

  const psuHeaders = capturePsuHeaders(request.headers);
  const { state, stateHash, expiresAt } = createAuthorizationState();
  const validUntil = new Date(
    Date.now() + authorizationInput.validDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  let authorization: Awaited<ReturnType<EnableBankingClient["startAuthorization"]>>;

  try {
    const client = new EnableBankingClient({
      applicationId: connection.externalApplicationId,
      pemPrivateKey: decryptConnectionPrivateKey(connection),
      baseUrl: process.env.ENABLE_BANKING_BASE_URL,
    });

    authorization = await client.startAuthorization({
      access: {
        validUntil,
        balances: true,
        transactions: true,
      },
      aspsp: {
        name: authorizationInput.aspspName,
        country: authorizationInput.aspspCountry,
      },
      state,
      redirectUrl: `${getAppUrl(request.url)}/api/callback`,
      psuType: authorizationInput.psuType,
      authMethod: authorizationInput.authMethod,
      language: authorizationInput.language,
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
        .where(eq(ingestionConnections.id, connection.id));
    } else {
      await db
        .update(ingestionConnections)
        .set({
          status: "authorization_failed",
          metadata: {
            ...(connection.metadata ?? {}),
            lastAuthorizationError: {
              message,
              at: new Date().toISOString(),
            },
          },
          updatedAt: new Date(),
        })
        .where(eq(ingestionConnections.id, connection.id));
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
          name: authorizationInput.aspspName,
          country: authorizationInput.aspspCountry,
      },
      access: {
        validUntil,
        balances: true,
        transactions: true,
      },
      psuType: authorizationInput.psuType,
      language: authorizationInput.language,
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
    .where(eq(ingestionConnections.id, connection.id));

  return NextResponse.json({
    authorizationId: authorization.authorization_id,
    redirectUrl: authorization.url,
    expiresAt,
  });
  },
);
