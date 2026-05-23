/**
 * Client-safe transaction list utilities.
 *
 * This file contains URL builders, filter parsers, constants, and types used
 * by both server and client components. It must NOT import server-only modules
 * like @/db or env config.
 */

// ---------------------------------------------------------------------------
// Constants & types
// ---------------------------------------------------------------------------

export const PAGE_SIZE = 50;

export const SORT_KEYS = ["date", "description", "account", "category", "amount"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDirection = "asc" | "desc";

export const CLASSIFICATION_FILTERS = [
  "all",
  "suggestions",
  "needs-review",
  "auto-labeled",
  "user-labeled",
  "uncategorized",
] as const;
export type ClassificationFilter = (typeof CLASSIFICATION_FILTERS)[number];

export const TRANSFER_FILTERS = ["all", "linked", "review", "one-sided"] as const;
export type TransferFilter = (typeof TRANSFER_FILTERS)[number];

/** Validated and normalized filters for the transaction list. */
export type TransactionListFilters = {
  accountId: string | undefined;
  query: string;
  classification: ClassificationFilter;
  transfer: TransferFilter;
  page: number;
  sort: SortKey;
  direction: SortDirection;
};

/** Category option for filter/form UIs. */
export type CategoryOption = { id: string; name: string };
/** Account option for filter/form UIs. */
export type AccountOption = { id: string; name: string };

/** Transfer link summary for an enriched row. */
export type TransferSummary = {
  groupId: string;
  role: string;
  confidence: string;
  confirmed: boolean;
  counterpart: {
    accountName: string;
    amountCents: number;
    currency: string;
    date: string;
  } | null;
};

// ---------------------------------------------------------------------------
// Search param parsing
// ---------------------------------------------------------------------------

function isSortKey(value: string | undefined): value is SortKey {
  return Boolean(value && SORT_KEYS.includes(value as SortKey));
}

function isClassificationFilter(value: string | undefined): value is ClassificationFilter {
  return Boolean(value && CLASSIFICATION_FILTERS.includes(value as ClassificationFilter));
}

function isTransferFilter(value: string | undefined): value is TransferFilter {
  return Boolean(value && TRANSFER_FILTERS.includes(value as TransferFilter));
}

/** Parse and validate raw URL search params into a typed filters object. */
export function parseTransactionSearchParams(
  params: {
    accountId?: string;
    classification?: string;
    direction?: string;
    page?: string;
    q?: string;
    sort?: string;
    transfer?: string;
  } | undefined,
): TransactionListFilters {
  return {
    accountId: params?.accountId,
    query: params?.q?.trim() ?? "",
    classification: isClassificationFilter(params?.classification)
      ? params.classification
      : "all",
    transfer: isTransferFilter(params?.transfer) ? params.transfer : "all",
    page: Math.max(Number(params?.page ?? 1), 1),
    sort: isSortKey(params?.sort) ? params.sort : "date",
    direction: params?.direction === "asc" ? "asc" : "desc",
  };
}

// ---------------------------------------------------------------------------
// URL building
// ---------------------------------------------------------------------------

/** Build a transaction list URL with filter overrides applied. */
export function buildTransactionListHref(
  current: TransactionListFilters,
  overrides: Partial<Omit<TransactionListFilters, "accountId">> & { accountId?: string | null },
): string {
  const params = new URLSearchParams();
  const accountId =
    overrides.accountId === undefined ? current.accountId : overrides.accountId ?? undefined;
  const classification = overrides.classification ?? current.classification;
  const sort = overrides.sort ?? current.sort;
  const direction = overrides.direction ?? current.direction;
  const page = overrides.page ?? current.page;
  const q = overrides.query === undefined ? current.query : overrides.query;
  const transfer = overrides.transfer ?? current.transfer;

  if (accountId) params.set("accountId", accountId);
  if (q) params.set("q", q);
  if (sort !== "date") params.set("sort", sort);
  if (direction !== "desc") params.set("direction", direction);
  if (classification !== "all") params.set("classification", classification);
  if (transfer !== "all") params.set("transfer", transfer);
  if (page > 1) params.set("page", String(page));

  return `/transactions${params.size ? `?${params}` : ""}`;
}
