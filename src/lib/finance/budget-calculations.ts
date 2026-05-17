import { eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { budgetLines, budgets, categories, transactions } from "@/db/schema";

export type BudgetLineWithSpent = {
  budgetLineId: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  categoryIcon: string;
  allocatedAmountCents: number;
  spentAmountCents: number;
  rolloverEnabled: boolean;
};

export type BudgetWithLines = {
  id: string;
  name: string;
  type: string;
  currency: string;
  periodStartDay: number;
  isActive: boolean;
  lines: BudgetLineWithSpent[];
  totalAllocatedCents: number;
  totalSpentCents: number;
};

/**
 * Compute the current period boundaries for a budget based on
 * its `type` and `periodStartDay`. Exported for testing.
 */
export function getCurrentPeriod(budget: {
  type: string;
  periodStartDay: number;
}): { from: string; to: string } {
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
 * Fetch all budget lines + spending for a set of budgets sharing the same
 * period bounds. Returns a flat list tagged with budgetId for reassembly.
 */
async function fetchLinesWithSpending(
  budgetIds: string[],
  householdId: string,
  period: { from: string; to: string },
): Promise<(BudgetLineWithSpent & { budgetId: string })[]> {
  return db
    .select({
      budgetId: budgetLines.budgetId,
      budgetLineId: budgetLines.id,
      categoryId: budgetLines.categoryId,
      categoryName: categories.name,
      categoryColor: categories.color,
      categoryIcon: categories.icon,
      allocatedAmountCents: budgetLines.allocatedAmountCents,
      rolloverEnabled: budgetLines.rolloverEnabled,
      spentAmountCents: sql<number>`COALESCE(
        (SELECT ABS(SUM(${transactions.amountCents}))
         FROM ${transactions}
         WHERE (
           ${transactions.categoryId} = ${budgetLines.categoryId}
           OR ${transactions.categoryId} IN (
             SELECT child.id
             FROM ${categories} child
             WHERE child.parent_id = ${budgetLines.categoryId}
               AND child.household_id = ${householdId}
           )
         )
           AND ${transactions.householdId} = ${householdId}
           AND ${transactions.date} >= ${period.from}
           AND ${transactions.date} < ${period.to}
           AND ${transactions.amountCents} < 0
           AND ${transactions.excludedFromBudget} = false
        ), 0)::bigint`,
    })
    .from(budgetLines)
    .innerJoin(categories, eq(categories.id, budgetLines.categoryId))
    .where(inArray(budgetLines.budgetId, budgetIds));
}

/**
 * Compute spent amounts for all budget lines by joining to transactions
 * within the current budget period. Fetches all budgets and their lines in
 * at most 1 + P queries (where P = number of unique period bounds, typically 1).
 */
export async function getBudgetsWithSpending(
  householdId: string,
): Promise<BudgetWithLines[]> {
  // Step 1: Fetch all budgets with column projection (1 query)
  const budgetRows = await db
    .select({
      id: budgets.id,
      name: budgets.name,
      type: budgets.type,
      currency: budgets.currency,
      periodStartDay: budgets.periodStartDay,
      isActive: budgets.isActive,
    })
    .from(budgets)
    .where(eq(budgets.householdId, householdId));

  if (budgetRows.length === 0) {
    return [];
  }

  // Step 2: Compute period per budget and group by period bounds.
  // Most households use the same periodStartDay for all budgets, so this
  // typically produces a single group (1 additional query total).
  const periodGroups = new Map<
    string,
    { budgetIds: string[]; period: { from: string; to: string } }
  >();

  for (const budget of budgetRows) {
    const period = getCurrentPeriod(budget);
    const key = `${period.from}|${period.to}`;
    const group = periodGroups.get(key);
    if (group) {
      group.budgetIds.push(budget.id);
    } else {
      periodGroups.set(key, { budgetIds: [budget.id], period });
    }
  }

  // Step 3: Fetch lines + spending per period group (1 query per unique period)
  const linesByBudgetId = new Map<string, BudgetLineWithSpent[]>();

  const groupQueries = [...periodGroups.values()].map((group) =>
    fetchLinesWithSpending(group.budgetIds, householdId, group.period),
  );
  const groupResults = await Promise.all(groupQueries);

  for (const rows of groupResults) {
    for (const row of rows) {
      const existing = linesByBudgetId.get(row.budgetId);
      if (existing) {
        existing.push(row);
      } else {
        linesByBudgetId.set(row.budgetId, [row]);
      }
    }
  }

  // Step 4: Assemble results
  return budgetRows.map((budget) => {
    const lines = linesByBudgetId.get(budget.id) ?? [];
    const totalAllocatedCents = lines.reduce(
      (sum, line) => sum + line.allocatedAmountCents,
      0,
    );
    const totalSpentCents = lines.reduce(
      (sum, line) => sum + line.spentAmountCents,
      0,
    );

    return {
      ...budget,
      lines,
      totalAllocatedCents,
      totalSpentCents,
    };
  });
}
