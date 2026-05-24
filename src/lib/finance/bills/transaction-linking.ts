import { and, eq, ilike, or, type SQL } from "drizzle-orm";

import { recurringBills, transactions } from "@/db/schema";

/** Escape `%` and `_` for safe use in SQL ILIKE patterns. */
export function escapeIlikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/** Normalize user search input for transaction/bill linking dialogs. */
export function normalizeLinkSearchQuery(raw: string | undefined): string | null {
  const trimmed = raw?.trim() ?? "";
  if (trimmed.length < 2) return null;
  return trimmed.slice(0, 200);
}

function uniqueTokens(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const value of values) {
    if (!value) continue;
    for (const part of value.toLowerCase().split(/[^a-z0-9æøå]+/i)) {
      if (part.length < 3 || seen.has(part)) continue;
      seen.add(part);
      tokens.push(part);
    }
  }
  return tokens;
}

export function merchantTokensFromBill(
  merchantPattern: string,
  billName: string,
): string[] {
  const patternToken =
    merchantPattern.startsWith("merchant:") ? null : merchantPattern;
  return uniqueTokens([billName, patternToken]);
}

type TransactionMerchantFields = {
  merchantId: string | null;
  normalizedMerchantName: string | null;
  merchantName: string | null;
  description: string | null;
};

/**
 * SQL condition: expense row plausibly belongs to this bill's merchant.
 * Uses pattern key, bill display name, and text fields (not only normalized name).
 */
export function buildTransactionMatchesBillMerchantCondition(
  merchantPattern: string,
  billName: string,
): SQL {
  const parts: SQL[] = [];

  if (merchantPattern.startsWith("merchant:")) {
    const merchantId = merchantPattern.slice("merchant:".length);
    if (merchantId.length > 0) {
      parts.push(eq(transactions.merchantId, merchantId));
    }
  } else {
    parts.push(eq(transactions.normalizedMerchantName, merchantPattern));
    const patternLike = `%${escapeIlikePattern(merchantPattern)}%`;
    parts.push(ilike(transactions.normalizedMerchantName, patternLike));
    parts.push(ilike(transactions.merchantName, patternLike));
    parts.push(ilike(transactions.description, patternLike));
    parts.push(ilike(transactions.searchText, patternLike));
  }

  const escapedName = `%${escapeIlikePattern(billName)}%`;
  parts.push(ilike(transactions.merchantName, escapedName));
  parts.push(ilike(transactions.description, escapedName));
  parts.push(ilike(transactions.searchText, escapedName));

  for (const token of merchantTokensFromBill(merchantPattern, billName)) {
    const tokenLike = `%${escapeIlikePattern(token)}%`;
    parts.push(ilike(transactions.searchText, tokenLike));
    parts.push(ilike(transactions.merchantName, tokenLike));
    parts.push(ilike(transactions.description, tokenLike));
    parts.push(ilike(transactions.normalizedMerchantName, tokenLike));
  }

  return or(...parts)!;
}

/** Optional text search across transaction label fields. */
export function buildTransactionTextSearchCondition(
  search: string | null,
): SQL | undefined {
  if (!search) return undefined;

  const pattern = `%${escapeIlikePattern(search)}%`;
  return or(
    ilike(transactions.description, pattern),
    ilike(transactions.merchantName, pattern),
    ilike(transactions.normalizedMerchantName, pattern),
    ilike(transactions.searchText, pattern),
  );
}

/**
 * SQL condition: bill row is a plausible link target for this transaction.
 */
export function buildBillMatchesTransactionCondition(
  txn: TransactionMerchantFields,
): SQL | undefined {
  const parts: SQL[] = [];

  if (txn.merchantId) {
    parts.push(
      eq(recurringBills.merchantPattern, `merchant:${txn.merchantId}`),
    );
  }

  if (txn.normalizedMerchantName) {
    parts.push(
      eq(recurringBills.merchantPattern, txn.normalizedMerchantName),
    );
    const like = `%${escapeIlikePattern(txn.normalizedMerchantName)}%`;
    parts.push(ilike(recurringBills.merchantPattern, like));
    parts.push(ilike(recurringBills.name, like));
  }

  const tokens = uniqueTokens([
    txn.merchantName,
    txn.description,
    txn.normalizedMerchantName,
  ]);
  for (const token of tokens) {
    const tokenLike = `%${escapeIlikePattern(token)}%`;
    parts.push(ilike(recurringBills.name, tokenLike));
    parts.push(ilike(recurringBills.merchantPattern, tokenLike));
  }

  if (parts.length === 0) return undefined;
  return or(...parts);
}

export function buildBillNameSearchCondition(
  search: string | null,
): SQL | undefined {
  if (!search) return undefined;
  const pattern = `%${escapeIlikePattern(search)}%`;
  return or(
    ilike(recurringBills.name, pattern),
    ilike(recurringBills.merchantPattern, pattern),
  );
}
