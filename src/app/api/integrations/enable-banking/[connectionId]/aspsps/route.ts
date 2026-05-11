import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { ingestionConnections } from "@/db/schema";
import { getActiveHousehold } from "@/lib/finance/household";
import { EnableBankingClient } from "@/lib/ingestion/enable-banking/client";
import { decryptSecret } from "@/lib/security/encryption";

function decryptPrivateKey(connection: typeof ingestionConnections.$inferSelect) {
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const { connectionId } = await params;
  const household = await getActiveHousehold();
  const url = new URL(request.url);

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

  if (!connection?.externalApplicationId) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  const client = new EnableBankingClient({
    applicationId: connection.externalApplicationId,
    pemPrivateKey: decryptPrivateKey(connection),
    baseUrl: process.env.ENABLE_BANKING_BASE_URL,
  });

  const result = await client.listAspsps({
    country: url.searchParams.get("country") ?? undefined,
    psuType: url.searchParams.get("psu_type") ?? undefined,
    service: url.searchParams.get("service") ?? undefined,
  });

  return NextResponse.json(result);
}
