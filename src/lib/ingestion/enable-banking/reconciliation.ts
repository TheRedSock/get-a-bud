import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { financialAccounts, transactions } from "@/db/schema";
import { parseMoneyToCents, centsToDecimalString } from "@/lib/finance/money";

export async function reconcileAccountBalance(input: {
  householdId: string;
  financialAccountId: string;
  providerAccountId: string;
  currency: string;
  reportedBalance?: string;
}) {
  const offsetSourceTransactionId = `enable-banking-opening-balance:${input.providerAccountId}`;

  const [totals] = await db
    .select({
      totalSumCents: sql<number>`COALESCE(SUM(${transactions.amountCents}), 0)`,
      nonOffsetSumCents: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.sourceTransactionId} IS DISTINCT FROM ${offsetSourceTransactionId} THEN ${transactions.amountCents} ELSE 0 END), 0)`,
      manualCount: sql<number>`COUNT(CASE WHEN ${transactions.source} = 'manual' THEN 1 END)`,
    })
    .from(transactions)
    .where(eq(transactions.accountId, input.financialAccountId));

  const [existingOffset] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, input.financialAccountId),
        eq(transactions.sourceTransactionId, offsetSourceTransactionId),
      ),
    )
    .limit(1);

  const [earliest] = await db
    .select({ date: sql<string>`MIN(${transactions.date})` })
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, input.financialAccountId),
        sql`${transactions.sourceTransactionId} IS DISTINCT FROM ${offsetSourceTransactionId}`,
      ),
    );

  const transactionSumCents = totals?.nonOffsetSumCents ?? 0;
  const manualTransactionCount = totals?.manualCount ?? 0;
  const reportedBalanceCents =
    input.reportedBalance === undefined
      ? undefined
      : parseMoneyToCents(input.reportedBalance);
  const offsetCents =
    reportedBalanceCents === undefined
      ? 0
      : reportedBalanceCents - transactionSumCents;
  const earliestDate =
    earliest?.date ?? new Date().toISOString().slice(0, 10);
  const balanceMetadata = {
    source: "transactions",
    reportedBalance: input.reportedBalance,
    transactionSum: centsToDecimalString(transactionSumCents),
    offsetAmount: centsToDecimalString(offsetCents),
    manualTransactionsPresent: manualTransactionCount > 0,
    manualTransactionCount,
    discrepancy: offsetCents !== 0,
    updatedAt: new Date().toISOString(),
  };

  if (reportedBalanceCents === undefined) {
    const calculatedBalanceCents = totals?.totalSumCents ?? 0;
    const [account] = await db
      .select({ metadata: financialAccounts.metadata })
      .from(financialAccounts)
      .where(eq(financialAccounts.id, input.financialAccountId))
      .limit(1);
    const metadata = account?.metadata ?? {};
    const existingBalanceMetadata =
      typeof metadata.balance === "object" && metadata.balance
        ? (metadata.balance as Record<string, unknown>)
        : {};

    await db
      .update(financialAccounts)
      .set({
        currentBalanceCents: calculatedBalanceCents,
        metadata: {
          ...metadata,
          balance: {
            ...existingBalanceMetadata,
            ...balanceMetadata,
            balanceUnavailable: true,
            calculatedBalance: centsToDecimalString(calculatedBalanceCents),
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(financialAccounts.id, input.financialAccountId));
    return;
  }

  if (offsetCents !== 0) {
    const values = {
      householdId: input.householdId,
      accountId: input.financialAccountId,
      source: "enable_banking" as const,
      sourceTransactionId: offsetSourceTransactionId,
      amountCents: offsetCents,
      currency: input.currency,
      date: earliestDate,
      merchantName: "Opening balance adjustment",
      normalizedMerchantName: "opening balance adjustment",
      description: "Opening balance adjustment",
      searchText: "Opening balance adjustment",
      metadata: {
        kind: "opening_balance_offset",
        provider: "enable_banking",
        ...balanceMetadata,
      },
    };

    if (existingOffset) {
      await db
        .update(transactions)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(transactions.id, existingOffset.id));
    } else {
      await db.insert(transactions).values(values);
    }
  } else if (existingOffset) {
    await db.delete(transactions).where(eq(transactions.id, existingOffset.id));
  }

  const calculatedBalanceCents =
    reportedBalanceCents === undefined
      ? transactionSumCents
      : reportedBalanceCents;
  const [account] = await db
    .select({ metadata: financialAccounts.metadata })
    .from(financialAccounts)
    .where(eq(financialAccounts.id, input.financialAccountId))
    .limit(1);
  const metadata = account?.metadata ?? {};
  const existingBalanceMetadata =
    typeof metadata.balance === "object" && metadata.balance
      ? (metadata.balance as Record<string, unknown>)
      : {};

  await db
    .update(financialAccounts)
    .set({
      currentBalanceCents: calculatedBalanceCents,
      metadata: {
        ...metadata,
        balance: {
          ...existingBalanceMetadata,
          ...balanceMetadata,
          calculatedBalance: centsToDecimalString(calculatedBalanceCents),
        },
      },
      updatedAt: new Date(),
    })
    .where(eq(financialAccounts.id, input.financialAccountId));
}
