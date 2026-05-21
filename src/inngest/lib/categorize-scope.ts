import { and, eq, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import { ingestionConnections, providerAccounts } from "@/db/schema";

export async function resolveHouseholdIdForConnection(connectionId: string) {
  const [conn] = await db
    .select({ householdId: ingestionConnections.householdId })
    .from(ingestionConnections)
    .where(eq(ingestionConnections.id, connectionId))
    .limit(1);

  return conn?.householdId;
}

export async function loadFinancialAccountIdsForConnection(connectionId: string) {
  const rows = await db
    .select({ financialAccountId: providerAccounts.financialAccountId })
    .from(providerAccounts)
    .where(
      and(
        eq(providerAccounts.connectionId, connectionId),
        isNotNull(providerAccounts.financialAccountId),
      ),
    );

  return rows
    .map((row) => row.financialAccountId)
    .filter((id): id is string => id != null);
}
