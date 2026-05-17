import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { financialAccounts, transactions } from "@/db/schema";

/**
 * Recalculate and persist the current balance for a financial account by
 * summing all its transactions in the database. Uses SQL aggregation so
 * that transaction rows are never loaded into Node.js memory.
 *
 * The update is scoped to both the accountId AND householdId so that a
 * caller cannot accidentally recalculate an account belonging to another
 * household.
 *
 * Returns the new balance in integer cents.
 */
export async function recalculateAccountBalance(input: {
  accountId: string;
  householdId: string;
}): Promise<number> {
  const { accountId, householdId } = input;

  const [result] = await db
    .select({
      sum: sql<number>`COALESCE(SUM(${transactions.amountCents}), 0)::bigint`,
    })
    .from(transactions)
    .where(
      and(eq(transactions.accountId, accountId), eq(transactions.householdId, householdId)),
    );

  const newBalanceCents = Number(result?.sum ?? 0);

  await db
    .update(financialAccounts)
    .set({ currentBalanceCents: newBalanceCents, updatedAt: new Date() })
    .where(
      and(eq(financialAccounts.id, accountId), eq(financialAccounts.householdId, householdId)),
    );

  return newBalanceCents;
}
