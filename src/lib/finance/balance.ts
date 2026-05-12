import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { financialAccounts, transactions } from "@/db/schema";

/**
 * Recalculate and persist the current balance for a financial account by
 * summing all its transactions in the database. Uses SQL aggregation so
 * that transaction rows are never loaded into Node.js memory.
 *
 * Returns the new balance as a string (numeric(18,2)).
 */
export async function recalculateAccountBalance(accountId: string) {
  const [result] = await db
    .select({
      sum: sql<string>`COALESCE(SUM(${transactions.amount}), 0)`,
    })
    .from(transactions)
    .where(eq(transactions.accountId, accountId));

  const newBalance = result?.sum ?? "0";

  await db
    .update(financialAccounts)
    .set({ currentBalance: newBalance, updatedAt: new Date() })
    .where(eq(financialAccounts.id, accountId));

  return newBalance;
}
