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
import { getActiveHousehold } from "@/lib/finance/household";

const toNumber = (value: string | null | undefined) => Number(value ?? 0);

export async function GET() {
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

  const cashBalance = accounts.reduce(
    (sum, account) => sum + toNumber(account.currentBalance),
    0,
  );
  const manualAssets = assetRows.reduce(
    (sum, asset) => sum + toNumber(asset.estimatedValue),
    0,
  );
  const debts = debtRows.reduce(
    (sum, debt) => sum + toNumber(debt.currentBalance),
    0,
  );
  const monthSpend = recentTransactions
    .filter((transaction) => toNumber(transaction.amount) < 0)
    .reduce((sum, transaction) => sum + Math.abs(toNumber(transaction.amount)), 0);
  const monthIncome = recentTransactions
    .filter((transaction) => toNumber(transaction.amount) > 0)
    .reduce((sum, transaction) => sum + toNumber(transaction.amount), 0);

  return NextResponse.json({
    household,
    summary: {
      cashBalance,
      netWorth: cashBalance + manualAssets - debts,
      monthSpend,
      monthIncome,
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
}
