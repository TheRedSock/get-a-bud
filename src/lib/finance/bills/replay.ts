import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { recurringBills } from "@/db/schema";

/** Whether the detect-recurring-bills job should clear pending bills before Phase A. */
export function shouldClearUnapprovedForReplayStart(params: {
  replayUnapproved?: boolean;
  matchExpenseOffset?: number;
  expenseOffset?: number;
}): boolean {
  if (!params.replayUnapproved) {
    return false;
  }
  const expenseOffset = params.expenseOffset ?? 0;
  const matchExpenseOffset = params.matchExpenseOffset ?? 0;
  return expenseOffset === 0 && matchExpenseOffset === 0;
}

/**
 * Removes unapproved recurring bills so a manual detection replay can
 * re-evaluate merchants with current rules (e.g. coverage gate).
 *
 * Preserves bills the user approved (categoryId set) or explicitly ended
 * (userEndedAt). Does not mark transactions as ignored — unlike rejectBill.
 */
export async function clearUnapprovedBillsForReplay(
  householdId: string,
): Promise<{ removed: number }> {
  const deleted = await db
    .delete(recurringBills)
    .where(
      and(
        eq(recurringBills.householdId, householdId),
        isNull(recurringBills.categoryId),
        isNull(recurringBills.userEndedAt),
      ),
    )
    .returning({ id: recurringBills.id });

  return { removed: deleted.length };
}
