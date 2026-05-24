import { and, desc, eq, gte, isNotNull, lt, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  categories,
  financialAccounts,
  recurringBills,
  transactions,
} from "@/db/schema";
import { getBudgetsWithSpending } from "@/lib/finance/budget-calculations";
import { formatBillScheduleLabel } from "@/lib/finance/bills/display";

import type {
  BalancePoint,
  CashFlowPoint,
  DashboardAccount,
  DashboardBill,
  DashboardBudgetRow,
  DashboardData,
  DashboardTransaction,
  SpendingPoint,
  SummaryCardIcon,
} from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a YYYY-MM date string as a short month label.
 * Accepts an optional locale; defaults to "en" until user locale
 * is threaded from session/preferences.
 */
function formatMonthLabel(yearMonth: string, locale = "en"): string {
  const [yearStr, monthStr] = yearMonth.split("-");
  const formatter = new Intl.DateTimeFormat(locale, { month: "short" });
  return formatter.format(new Date(Number(yearStr), Number(monthStr) - 1, 1));
}

/** Compute ISO date string for the first day of the current calendar month. */
function currentMonthStart(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
}

/** Compute ISO date string for 6 months ago (for cash flow range). */
function sixMonthsAgo(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - 5, 1)
    .toISOString()
    .slice(0, 10);
}

const SPENDING_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

// ---------------------------------------------------------------------------
// Domain queries
// ---------------------------------------------------------------------------

/** Fetch account summary rows for the dashboard accounts section. */
export async function getAccountsSummary(
  householdId: string,
): Promise<DashboardAccount[]> {
  const rows = await db
    .select({
      name: financialAccounts.name,
      kind: financialAccounts.kind,
      currentBalanceCents: financialAccounts.currentBalanceCents,
      isManual: financialAccounts.isManual,
      institutionName: financialAccounts.institutionName,
    })
    .from(financialAccounts)
    .where(eq(financialAccounts.householdId, householdId));

  return rows.map((account) => ({
    name: account.name,
    kind: account.kind,
    balance: account.currentBalanceCents ?? 0,
    trend: account.isManual ? "Manual" : account.institutionName ?? "Synced",
  }));
}

/**
 * Compute total balance across all accounts and current month spending
 * using SQL aggregation (not a JS loop over recent transactions).
 */
export async function getMonthSummary(
  householdId: string,
): Promise<{ totalBalance: number; monthSpending: number; accountCount: number }> {
  const monthStart = currentMonthStart();

  const [[balanceRow], [spendingRow]] = await Promise.all([
    db
      .select({
        total: sql<number>`COALESCE(SUM(${financialAccounts.currentBalanceCents}), 0)::bigint`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(financialAccounts)
      .where(eq(financialAccounts.householdId, householdId)),
    db
      .select({
        total: sql<number>`COALESCE(ABS(SUM(${transactions.amountCents})), 0)::bigint`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.householdId, householdId),
          gte(transactions.date, monthStart),
          lt(transactions.amountCents, 0),
        ),
      ),
  ]);

  return {
    totalBalance: Number(balanceRow?.total ?? 0),
    monthSpending: Number(spendingRow?.total ?? 0),
    accountCount: Number(balanceRow?.count ?? 0),
  };
}

/**
 * Cash flow series for the last 6 months using SQL GROUP BY.
 * Returns income and expenses aggregated per calendar month.
 */
export async function getCashFlowSeries(
  householdId: string,
): Promise<CashFlowPoint[]> {
  const rangeStart = sixMonthsAgo();

  const rows = await db
    .select({
      month: sql<string>`to_char(${transactions.date}::date, 'YYYY-MM')`,
      income: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.amountCents} >= 0 THEN ${transactions.amountCents} ELSE 0 END), 0)::bigint`,
      expenses: sql<number>`COALESCE(ABS(SUM(CASE WHEN ${transactions.amountCents} < 0 THEN ${transactions.amountCents} ELSE 0 END)), 0)::bigint`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, householdId),
        gte(transactions.date, rangeStart),
      ),
    )
    .groupBy(sql`to_char(${transactions.date}::date, 'YYYY-MM')`)
    .orderBy(sql`to_char(${transactions.date}::date, 'YYYY-MM')`);

  return rows.map((row) => {
    return {
      month: formatMonthLabel(row.month),
      income: Number(row.income),
      expenses: Number(row.expenses),
    };
  });
}

/**
 * Spending breakdown by category for the current month.
 * Returns top spending categories (expenses only) for pie chart.
 */
export async function getSpendingByCategory(
  householdId: string,
): Promise<SpendingPoint[]> {
  const monthStart = currentMonthStart();

  const rows = await db
    .select({
      name: sql<string>`COALESCE(${categories.name}, 'Uncategorized')`,
      total: sql<number>`ABS(SUM(${transactions.amountCents}))::bigint`,
    })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        eq(transactions.householdId, householdId),
        gte(transactions.date, monthStart),
        lt(transactions.amountCents, 0),
      ),
    )
    .groupBy(categories.name)
    .orderBy(sql`ABS(SUM(${transactions.amountCents})) DESC`)
    .limit(5);

  return rows.map((row, index) => ({
    name: row.name,
    value: Number(row.total),
    color: SPENDING_COLORS[index % SPENDING_COLORS.length],
  }));
}

/** Current balance as a single data point for the balance trend chart. */
export async function getBalanceTrend(
  householdId: string,
): Promise<BalancePoint[]> {
  const rows = await db
    .select({
      currentBalanceCents: financialAccounts.currentBalanceCents,
    })
    .from(financialAccounts)
    .where(eq(financialAccounts.householdId, householdId));

  const balance = rows.reduce(
    (sum, account) => sum + (account.currentBalanceCents ?? 0),
    0,
  );

  return balance ? [{ day: "Now", balance }] : [];
}

/** Recent transactions for the dashboard activity list. */
export async function getRecentTransactions(
  householdId: string,
  limit = 8,
): Promise<DashboardTransaction[]> {
  const rows = await db
    .select({
      merchantName: transactions.merchantName,
      description: transactions.description,
      source: transactions.source,
      amountCents: transactions.amountCents,
      date: transactions.date,
      categoryName: categories.name,
    })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(eq(transactions.householdId, householdId))
    .orderBy(desc(transactions.date))
    .limit(limit);

  return rows.map((row) => ({
    merchant: row.merchantName ?? row.description,
    category: row.categoryName ?? row.source.replace("_", " "),
    amount: row.amountCents,
    date: row.date,
  }));
}

/** Upcoming recurring bills for the bills section (approved active only). */
export async function getUpcomingBills(
  householdId: string,
): Promise<DashboardBill[]> {
  const rows = await db
    .select({
      name: recurringBills.name,
      nextDueDate: recurringBills.nextDueDate,
      expectedAmountCents: recurringBills.expectedAmountCents,
      lastAmountCents: recurringBills.lastAmountCents,
      isActive: recurringBills.isActive,
      userEndedAt: recurringBills.userEndedAt,
      autoEndedAt: recurringBills.autoEndedAt,
      updatedAt: recurringBills.updatedAt,
    })
    .from(recurringBills)
    .where(
      and(
        eq(recurringBills.householdId, householdId),
        eq(recurringBills.isActive, true),
        isNotNull(recurringBills.categoryId),
      ),
    );

  return rows.map((bill) => ({
    name: bill.name,
    due: formatBillScheduleLabel({
      isActive: bill.isActive,
      nextDueDate: bill.nextDueDate,
      userEndedAt: bill.userEndedAt,
      autoEndedAt: bill.autoEndedAt,
      lastPaymentDate: null,
      updatedAt: bill.updatedAt,
    }),
    amount: bill.expectedAmountCents ?? bill.lastAmountCents ?? 0,
    status: "Active",
  }));
}

/** Budget line summaries for the budget health progress bars. */
export async function getBudgetHealthRows(
  householdId: string,
): Promise<DashboardBudgetRow[]> {
  const budgets = await getBudgetsWithSpending(householdId);
  return budgets.flatMap((budget) =>
    budget.lines.map((line) => ({
      name: line.categoryName,
      spent: line.spentAmountCents,
      allocated: line.allocatedAmountCents,
    })),
  );
}

// ---------------------------------------------------------------------------
// Aggregated dashboard data loader
// ---------------------------------------------------------------------------

/**
 * Load all dashboard data in parallel. This is the single entry point
 * called by the dashboard page server component.
 */
export async function getDashboardData(
  householdId: string,
): Promise<DashboardData> {
  const [
    accounts,
    monthSummary,
    recentTransactions,
    budgetRows,
    bills,
    cashFlowData,
    spendingData,
    balanceData,
  ] = await Promise.all([
    getAccountsSummary(householdId),
    getMonthSummary(householdId),
    getRecentTransactions(householdId),
    getBudgetHealthRows(householdId),
    getUpcomingBills(householdId),
    getCashFlowSeries(householdId),
    getSpendingByCategory(householdId),
    getBalanceTrend(householdId),
  ]);

  const totalBillAmount = bills.reduce((sum, bill) => sum + bill.amount, 0);

  return {
    accounts,
    transactions: recentTransactions,
    budgetRows,
    bills,
    cashFlowData,
    spendingData,
    balanceData,
    summaryCards: [
      {
        label: "Current balance",
        value: monthSummary.totalBalance,
        icon: "wallet" satisfies SummaryCardIcon,
        helper: monthSummary.accountCount
          ? `${monthSummary.accountCount} account${monthSummary.accountCount === 1 ? "" : "s"}`
          : "No accounts connected",
      },
      {
        label: "Month spending",
        value: monthSummary.monthSpending,
        icon: "landmark" satisfies SummaryCardIcon,
        helper: "Current calendar month",
      },
      {
        label: "Upcoming bills",
        value: totalBillAmount,
        icon: "calendar-clock" satisfies SummaryCardIcon,
        helper: `${bills.length} expected`,
      },
    ],
  };
}
