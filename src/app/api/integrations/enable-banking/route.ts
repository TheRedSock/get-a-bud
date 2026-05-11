import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { ingestionConnections } from "@/db/schema";
import { getActiveHousehold } from "@/lib/finance/household";
import { encryptSecret } from "@/lib/security/encryption";

const connectionSchema = z.object({
  displayName: z.string().min(1).max(120).default("Enable Banking"),
  applicationId: z.string().min(1),
  pemPrivateKey: z.string().min(100),
});

export async function GET() {
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
}

export async function POST(request: Request) {
  const household = await getActiveHousehold();
  const body = await request.json().catch(() => null);
  const parsed = connectionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid Enable Banking connection payload" },
      { status: 400 },
    );
  }

  const encrypted = encryptSecret(parsed.data.pemPrivateKey);

  const [connection] = await db
    .insert(ingestionConnections)
    .values({
      householdId: household.householdId,
      provider: "enable_banking",
      displayName: parsed.data.displayName,
      externalApplicationId: parsed.data.applicationId,
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
}
