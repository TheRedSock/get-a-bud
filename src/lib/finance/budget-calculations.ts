import { and, eq, gte, lt, sql } from "drizzle-orm";

import { db } from "@/db";
import { budgetLines, budgets, categories, transactions } from "@/db/schema";

type BudgetLineWithSpent = {
  budgetLineId: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  categoryIcon: string;
  allocatedAmount: string;
  spentAmount: string;
  rolloverEnabled: boolean;
};

type BudgetWithLines = {
  id: string;
  name: string;
  type: string;
  currency: string;
  periodStartDay: number;
  isActive: boolean;
  lines: BudgetLineWithSpent[];
  totalAllocated: number;
  totalSpent: number;
};

/**
 * Compute the current monthly period boundaries for a budget based on
 * its `periodStartDay`. For weekly budgets, this returns the current week.
 */
function getCurrentPeriod(budget: { type: string; periodStartDay: number }) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  if (budget.type === "weekly") {
    const dayOfWeek = now.getDay();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - dayOfWeek);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);
    return {
      from: startOfWeek.toISOString().slice(0, 10),
      to: endOfWeek.toISOString().slice(0, 10),
    };
  }

  // Monthly / zero_based / envelope: period runs from periodStartDay to next month
  const startDay = budget.periodStartDay;
  let periodStart: Date;
  let periodEnd: Date;

  if (now.getDate() >= startDay) {
    periodStart = new Date(year, month, startDay);
    periodEnd = new Date(year, month + 1, startDay);
  } else {
    periodStart = new Date(year, month - 1, startDay);
    periodEnd = new Date(year, month, startDay);
  }

  return {
    from: periodStart.toISOString().slice(0, 10),
    to: periodEnd.toISOString().slice(0, 10),
  };
}

/**
 * Compute spent amounts for all budget lines by joining to transactions
 * within the current budget period. Returns enriched budget data ready
 * for display.
 */
export async function getBudgetsWithSpending(
  householdId: string,
): Promise<BudgetWithLines[]> {
  const budgetRows = await db
    .select()
    .from(budgets)
    .where(eq(budgets.householdId, householdId));

  if (budgetRows.length === 0) {
    return [];
  }

  const results: BudgetWithLines[] = [];

  for (const budget of budgetRows) {
    const period = getCurrentPeriod(budget);

    const lines = await db
      .select({
        budgetLineId: budgetLines.id,
        categoryId: budgetLines.categoryId,
        categoryName: categories.name,
        categoryColor: categories.color,
        categoryIcon: categories.icon,
        allocatedAmount: budgetLines.allocatedAmount,
        rolloverEnabled: budgetLines.rolloverEnabled,
        spentAmount: sql<string>`COALESCE(
          (SELECT ABS(SUM(${transactions.amount}))
           FROM ${transactions}
           WHERE ${transactions.categoryId} = ${budgetLines.categoryId}
             AND ${transactions.householdId} = ${householdId}
             AND ${transactions.date} >= ${period.from}
             AND ${transactions.date} < ${period.to}
             AND ${transactions.amount} < 0
             AND ${transactions.excludedFromBudget} = false
          ), 0)`,
      })
      .from(budgetLines)
      .innerJoin(categories, eq(categories.id, budgetLines.categoryId))
      .where(eq(budgetLines.budgetId, budget.id));

    const totalAllocated = lines.reduce(
      (sum, line) => sum + Number(line.allocatedAmount),
      0,
    );
    const totalSpent = lines.reduce(
      (sum, line) => sum + Number(line.spentAmount),
      0,
    );

    results.push({
      id: budget.id,
      name: budget.name,
      type: budget.type,
      currency: budget.currency,
      periodStartDay: budget.periodStartDay,
      isActive: budget.isActive,
      lines,
      totalAllocated,
      totalSpent,
    });
  }

  return results;
}
