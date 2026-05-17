import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import {
  assets,
  budgets,
  financialAccounts,
  liabilities,
  recurringBills,
  transactions,
} from "@/db/schema";
import { withApiHandler } from "@/lib/errors/api";
import { getActiveHousehold } from "@/lib/finance/household";

export const GET = withApiHandler("dashboard.get", async () => {
  const household = await getActiveHousehold();

  const [accounts, recentTransactions, activeBudgets, billRows, assetRows, debtRows] =
    await Promise.all([
      db
        .select()
        .from(financialAccounts)
        .where(eq(financialAccounts.householdId, household.householdId)),
      db
        .select()
        .from(transactions)
        .where(eq(transactions.householdId, household.householdId))
        .orderBy(desc(transactions.date))
        .limit(50),
      db
        .select()
        .from(budgets)
        .where(eq(budgets.householdId, household.householdId)),
      db
        .select()
        .from(recurringBills)
        .where(eq(recurringBills.householdId, household.householdId)),
      db.select().from(assets).where(eq(assets.householdId, household.householdId)),
      db
        .select()
        .from(liabilities)
        .where(eq(liabilities.householdId, household.householdId)),
    ]);

  const cashBalanceCents = accounts.reduce(
    (sum, account) => sum + (account.currentBalanceCents ?? 0),
    0,
  );
  const manualAssetsCents = assetRows.reduce(
    (sum, asset) => sum + (asset.estimatedValueCents ?? 0),
    0,
  );
  const debtsCents = debtRows.reduce(
    (sum, debt) => sum + (debt.currentBalanceCents ?? 0),
    0,
  );
  const monthSpendCents = recentTransactions
    .filter((transaction) => (transaction.amountCents ?? 0) < 0)
    .reduce((sum, transaction) => sum + Math.abs(transaction.amountCents ?? 0), 0);
  const monthIncomeCents = recentTransactions
    .filter((transaction) => (transaction.amountCents ?? 0) > 0)
    .reduce((sum, transaction) => sum + (transaction.amountCents ?? 0), 0);

  return NextResponse.json({
    household,
    summary: {
      cashBalanceCents,
      netWorthCents: cashBalanceCents + manualAssetsCents - debtsCents,
      monthSpendCents,
      monthIncomeCents,
      upcomingBills: billRows.length,
      activeBudgets: activeBudgets.length,
    },
    accounts,
    recentTransactions,
    budgets: activeBudgets,
    recurringBills: billRows,
    assets: assetRows,
    liabilities: debtRows,
  });
});
