import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { ingestionConnections } from "@/db/schema";
import { getActiveHousehold } from "@/lib/finance/household";
import { EnableBankingClient } from "@/lib/ingestion/enable-banking/client";
import { capturePsuHeaders } from "@/lib/ingestion/enable-banking/psu-headers";
import {
  createAuthorizationState,
  getAppUrl,
} from "@/lib/ingestion/enable-banking/state";
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
    throw new Error("Enable Banking private key is missing");
  }

  return decryptSecret({
    ciphertext: connection.encryptedPrivateKey,
    iv: connection.encryptedPrivateKeyIv,
    tag: connection.encryptedPrivateKeyTag,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const { connectionId } = await params;
  const household = await getActiveHousehold();
  const body = await request.json().catch(() => null);
  const parsed = startAuthorizationSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid Enable Banking authorization payload" },
      { status: 400 },
    );
  }

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
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  if (!connection.externalApplicationId) {
    return NextResponse.json(
      { error: "Enable Banking application ID is missing" },
      { status: 400 },
    );
  }

  const psuHeaders = capturePsuHeaders(request.headers);
  const { state, stateHash, expiresAt } = createAuthorizationState();
  const validUntil = new Date(
    Date.now() + parsed.data.validDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  const client = new EnableBankingClient({
    applicationId: connection.externalApplicationId,
    pemPrivateKey: decryptConnectionPrivateKey(connection),
    baseUrl: process.env.ENABLE_BANKING_BASE_URL,
  });

  const authorization = await client.startAuthorization({
    access: {
      validUntil,
      balances: true,
      transactions: true,
    },
    aspsp: {
      name: parsed.data.aspspName,
      country: parsed.data.aspspCountry,
    },
    state,
    redirectUrl: `${getAppUrl(request.url)}/api/callback`,
    psuType: parsed.data.psuType,
    authMethod: parsed.data.authMethod,
    language: parsed.data.language,
    psuHeaders,
  });

  const metadata = {
    ...(connection.metadata ?? {}),
    psuHeaders,
    pendingAuthorization: {
      aspsp: {
        name: parsed.data.aspspName,
        country: parsed.data.aspspCountry,
      },
      access: {
        validUntil,
        balances: true,
        transactions: true,
      },
      psuType: parsed.data.psuType,
      language: parsed.data.language,
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
}
