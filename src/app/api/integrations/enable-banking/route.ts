import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { ingestionConnections } from "@/db/schema";
import { validateJsonBody, withApiHandler } from "@/lib/errors/api";
import { getActiveHousehold } from "@/lib/finance/household";
import { encryptSecret } from "@/lib/security/encryption";

const connectionSchema = z.object({
  displayName: z.string().min(1).max(120).default("Enable Banking"),
  applicationId: z.string().min(1),
  pemPrivateKey: z.string().min(100),
});

export const GET = withApiHandler("enableBanking.connections.list", async () => {
  const household = await getActiveHousehold();
  const rows = await db
    .select({
      id: ingestionConnections.id,
      displayName: ingestionConnections.displayName,
      provider: ingestionConnections.provider,
      externalApplicationId: ingestionConnections.externalApplicationId,
      consentSessionId: ingestionConnections.consentSessionId,
      status: ingestionConnections.status,
      authorizationId: ingestionConnections.authorizationId,
      authorizationStateExpiresAt: ingestionConnections.authorizationStateExpiresAt,
      consentExpiresAt: ingestionConnections.consentExpiresAt,
      lastSyncedAt: ingestionConnections.lastSyncedAt,
      rateLimitedUntil: ingestionConnections.rateLimitedUntil,
    })
    .from(ingestionConnections)
    .where(eq(ingestionConnections.householdId, household.householdId));

  return NextResponse.json({
    connections: rows.map(({ consentSessionId, ...connection }) => ({
      ...connection,
      hasConsentSession: Boolean(consentSessionId),
    })),
  });
});

export const POST = withApiHandler(
  "enableBanking.connections.create",
  async (request) => {
    const household = await getActiveHousehold();
    const connectionInput = await validateJsonBody(
      request,
      connectionSchema,
      "Please provide an Enable Banking application ID and PEM private key.",
    );

    const encrypted = encryptSecret(connectionInput.pemPrivateKey);

    const [connection] = await db
      .insert(ingestionConnections)
      .values({
        householdId: household.householdId,
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

    return NextResponse.json({ connection }, { status: 201 });
  },
);
