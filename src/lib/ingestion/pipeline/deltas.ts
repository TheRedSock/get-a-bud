import { and, asc, eq, gt, or } from "drizzle-orm";

import { db } from "@/db";
import { transactions } from "@/db/schema";
import {
  enrichTransactionRows,
  getTransactionEnrichment,
  getTransactionListOptions,
} from "@/lib/finance/transactions";

const DELTA_LIMIT = 50;

export type ChangeCursor = {
  at: string;
  id: string;
};

export type DeltaFilters = {
  accountId?: string;
};

export function parseChangeCursor(
  since: string | null,
  sinceId: string | null,
): ChangeCursor | null {
  if (!since) return null;
  const at = new Date(since);
  if (Number.isNaN(at.getTime())) return null;
  return { at: at.toISOString(), id: sinceId ?? "" };
}

export async function fetchTransactionDeltas(
  householdId: string,
  cursor: ChangeCursor | null,
  filters?: DeltaFilters,
) {
  const cursorDate = cursor ? new Date(cursor.at) : new Date(0);
  const cursorId = cursor?.id ?? "";

  const changedCondition = cursor
    ? or(
        gt(transactions.updatedAt, cursorDate),
        and(
          eq(transactions.updatedAt, cursorDate),
          gt(transactions.id, cursorId),
        ),
      )
    : gt(transactions.updatedAt, new Date(0));

  const conditions = [
    eq(transactions.householdId, householdId),
    changedCondition!,
  ];

  if (filters?.accountId) {
    conditions.push(eq(transactions.accountId, filters.accountId));
  }

  const rows = await db
    .select({
      id: transactions.id,
      source: transactions.source,
      amountCents: transactions.amountCents,
      currency: transactions.currency,
      date: transactions.date,
      merchantName: transactions.merchantName,
      description: transactions.description,
      notes: transactions.notes,
      metadata: transactions.metadata,
      merchantId: transactions.merchantId,
      categoryId: transactions.categoryId,
      categorySource: transactions.categorySource,
      categoryConfidence: transactions.categoryConfidence,
      suggestedCategoryId: transactions.suggestedCategoryId,
      suggestedDescription: transactions.suggestedDescription,
      suggestedMerchantName: transactions.suggestedMerchantName,
      transactionType: transactions.transactionType,
      paymentChannel: transactions.paymentChannel,
      parserSource: transactions.parserSource,
      originalAmountCents: transactions.originalAmountCents,
      originalCurrency: transactions.originalCurrency,
      linkedTransactionId: transactions.linkedTransactionId,
      transferGroupId: transactions.transferGroupId,
      isRecurringCandidate: transactions.isRecurringCandidate,
      status: transactions.status,
      excludedFromBudget: transactions.excludedFromBudget,
      updatedAt: transactions.updatedAt,
      accountId: transactions.accountId,
    })
    .from(transactions)
    .where(and(...conditions))
    .orderBy(asc(transactions.updatedAt), asc(transactions.id))
    .limit(DELTA_LIMIT + 1);

  const overflow = rows.length > DELTA_LIMIT;
  const slice = rows.slice(0, DELTA_LIMIT);

  if (slice.length === 0) {
    return {
      transactions: [] as ReturnType<typeof enrichTransactionRows>,
      nextCursor: cursor,
      overflow: false,
    };
  }

  const options = await getTransactionListOptions(householdId);
  const accountNameById = new Map(options.accounts.map((a) => [a.id, a.name]));
  const categoryNameById = new Map(options.categories.map((c) => [c.id, c.name]));

  const visibleRows = slice.map((row) => ({
    ...row,
    accountName: accountNameById.get(row.accountId) ?? "Unknown account",
    categoryName: row.categoryId
      ? (categoryNameById.get(row.categoryId) ?? null)
      : null,
  }));

  const enrichment = await getTransactionEnrichment(
    householdId,
    visibleRows,
    options.categories,
  );

  // Type assertion: delta rows are structurally compatible with the enrichment
  // function's expected shape (same columns + accountName/categoryName).
  const enriched = enrichTransactionRows(
    visibleRows as Parameters<typeof enrichTransactionRows>[0],
    enrichment,
  );

  const last = slice[slice.length - 1]!;
  const nextCursor: ChangeCursor = {
    at: last.updatedAt.toISOString(),
    id: last.id,
  };

  return {
    transactions: enriched,
    nextCursor,
    overflow,
  };
}
