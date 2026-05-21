import { eq } from "drizzle-orm";

import { db } from "@/db";
import { financialAccounts } from "@/db/schema";

export async function listHouseholdAccounts(householdId: string) {
  return db
    .select({
      id: financialAccounts.id,
      name: financialAccounts.name,
      kind: financialAccounts.kind,
      currency: financialAccounts.currency,
      currentBalanceCents: financialAccounts.currentBalanceCents,
      institutionName: financialAccounts.institutionName,
      isManual: financialAccounts.isManual,
      metadata: financialAccounts.metadata,
    })
    .from(financialAccounts)
    .where(eq(financialAccounts.householdId, householdId));
}
