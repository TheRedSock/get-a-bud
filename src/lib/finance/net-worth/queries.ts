import { eq } from "drizzle-orm";

import { db } from "@/db";
import { assets, financialAccounts, liabilities } from "@/db/schema";

export type NetWorthItem = {
  id: string;
  name: string;
  kind: string;
  value: number;
};

export type NetWorthSummary = {
  items: NetWorthItem[];
  netWorth: number;
};

/**
 * Fetch all net-worth contributing items (accounts, assets, liabilities)
 * and compute the total net worth.
 */
export async function getNetWorthSummary(
  householdId: string,
): Promise<NetWorthSummary> {
  const [accountRows, assetRows, liabilityRows] = await Promise.all([
    db
      .select({
        id: financialAccounts.id,
        name: financialAccounts.name,
        kind: financialAccounts.kind,
        currentBalanceCents: financialAccounts.currentBalanceCents,
      })
      .from(financialAccounts)
      .where(eq(financialAccounts.householdId, householdId)),
    db
      .select({
        id: assets.id,
        name: assets.name,
        kind: assets.kind,
        estimatedValueCents: assets.estimatedValueCents,
      })
      .from(assets)
      .where(eq(assets.householdId, householdId)),
    db
      .select({
        id: liabilities.id,
        name: liabilities.name,
        kind: liabilities.kind,
        currentBalanceCents: liabilities.currentBalanceCents,
      })
      .from(liabilities)
      .where(eq(liabilities.householdId, householdId)),
  ]);

  const items: NetWorthItem[] = [
    ...accountRows.map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind,
      value: a.currentBalanceCents ?? 0,
    })),
    ...assetRows.map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind,
      value: a.estimatedValueCents ?? 0,
    })),
    ...liabilityRows.map((l) => ({
      id: l.id,
      name: l.name,
      kind: l.kind,
      value: -(l.currentBalanceCents ?? 0),
    })),
  ];

  const netWorth = items.reduce((sum, item) => sum + item.value, 0);

  return { items, netWorth };
}
