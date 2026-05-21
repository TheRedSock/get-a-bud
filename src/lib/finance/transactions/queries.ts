import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import { db } from "@/db";
import { buildTransactionViewFields } from "@/lib/finance/transactions/view";
import {
  categories,
  financialAccounts,
  recurringBillHistory,
  recurringBills,
  transactionLinks,
  transactions,
} from "@/db/schema";

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

const TRANSFER_TYPES = ["internal_transfer", "investment"] as const;

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

/** Badge counts for the classification and transfer filter toolbar. */
export type TransactionFilterCounts = {
  suggestions: number;
  needsReview: number;
  autoLabeled: number;
  uncategorized: number;
  linkedTransfers: number;
  transferReview: number;
};

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

/** Recurring bill link for an enriched row. */
export type RecurringBillLink = {
  transactionId: string | null;
  billName: string;
  cadence: string;
  nextDueDate: string | null;
  isPossiblyCancelled: boolean;
};

// ---------------------------------------------------------------------------
// Search param parsing
// ---------------------------------------------------------------------------

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

function isSortKey(value: string | undefined): value is SortKey {
  return Boolean(value && SORT_KEYS.includes(value as SortKey));
}

function isClassificationFilter(value: string | undefined): value is ClassificationFilter {
  return Boolean(value && CLASSIFICATION_FILTERS.includes(value as ClassificationFilter));
}

function isTransferFilter(value: string | undefined): value is TransferFilter {
  return Boolean(value && TRANSFER_FILTERS.includes(value as TransferFilter));
}

// ---------------------------------------------------------------------------
// URL building (view helper, kept here since filters are domain vocabulary)
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

// ---------------------------------------------------------------------------
// Query building (internal)
// ---------------------------------------------------------------------------

function buildWhereConditions(
  householdId: string,
  filters: TransactionListFilters,
): SQL {
  const conditions: SQL[] = [eq(transactions.householdId, householdId)];

  if (filters.accountId) {
    conditions.push(eq(transactions.accountId, filters.accountId));
  }

  if (filters.query) {
    conditions.push(
      or(
        ilike(transactions.searchText, `%${filters.query}%`),
        ilike(categories.name, `%${filters.query}%`),
      )!,
    );
  }

  if (filters.classification !== "all") {
    const classificationConditions: Record<
      Exclude<ClassificationFilter, "all">,
      SQL
    > = {
      suggestions: and(
        isNull(transactions.categoryId),
        isNotNull(transactions.suggestedCategoryId),
      )!,
      "needs-review": and(
        isNull(transactions.categoryId),
        isNull(transactions.suggestedCategoryId),
      )!,
      "auto-labeled": inArray(transactions.categorySource, [
        "merchant",
        "rule",
        "model",
      ]),
      "user-labeled": eq(transactions.categorySource, "user"),
      uncategorized: isNull(transactions.categoryId),
    };
    conditions.push(classificationConditions[filters.classification]);
  }

  if (filters.transfer !== "all") {
    const transferConditions: Record<Exclude<TransferFilter, "all">, SQL> = {
      linked: isNotNull(transactions.transferGroupId),
      review: sql`exists (
        select 1 from transaction_links
        where transaction_links.transaction_id = ${transactions.id}
          and transaction_links.confirmed = false
      )`,
      "one-sided": and(
        isNull(transactions.transferGroupId),
        eq(transactions.excludedFromBudget, true),
        inArray(transactions.transactionType, TRANSFER_TYPES),
      )!,
    };
    conditions.push(transferConditions[filters.transfer]);
  }

  return and(...conditions)!;
}

function getOrderColumn(sort: SortKey) {
  const sortColumns = {
    date: transactions.date,
    description: transactions.description,
    account: financialAccounts.name,
    category: categories.name,
    amount: transactions.amountCents,
  } satisfies Record<SortKey, unknown>;
  return sortColumns[sort];
}

function countWhere(where: SQL | undefined) {
  return db
    .select({ count: sql<string>`count(*)` })
    .from(transactions)
    .where(where)
    .then(([row]) => Number(row?.count ?? 0));
}

// ---------------------------------------------------------------------------
// Public queries
// ---------------------------------------------------------------------------

const SEARCH_LIMIT_WITH_QUERY = 100;
const SEARCH_LIMIT_DEFAULT = 20;

/** Search transactions for the global search page (household-scoped). */
export async function searchTransactions(householdId: string, query: string) {
  const hid = eq(transactions.householdId, householdId);
  const trimmed = query.trim();

  const rows = trimmed
    ? await db
        .select({
          id: transactions.id,
          source: transactions.source,
          date: transactions.date,
          amountCents: transactions.amountCents,
          currency: transactions.currency,
          merchantName: transactions.merchantName,
          description: transactions.description,
          categoryId: transactions.categoryId,
          categoryName: categories.name,
          categorySource: transactions.categorySource,
          categoryConfidence: transactions.categoryConfidence,
          suggestedCategoryId: transactions.suggestedCategoryId,
          metadata: transactions.metadata,
        })
        .from(transactions)
        .leftJoin(categories, eq(categories.id, transactions.categoryId))
        .where(and(hid, ilike(transactions.searchText, `%${trimmed}%`)))
        .orderBy(desc(transactions.date))
        .limit(SEARCH_LIMIT_WITH_QUERY)
    : await db
        .select({
          id: transactions.id,
          source: transactions.source,
          date: transactions.date,
          amountCents: transactions.amountCents,
          currency: transactions.currency,
          merchantName: transactions.merchantName,
          description: transactions.description,
          categoryId: transactions.categoryId,
          categoryName: categories.name,
          categorySource: transactions.categorySource,
          categoryConfidence: transactions.categoryConfidence,
          suggestedCategoryId: transactions.suggestedCategoryId,
          metadata: transactions.metadata,
        })
        .from(transactions)
        .leftJoin(categories, eq(categories.id, transactions.categoryId))
        .where(hid)
        .orderBy(desc(transactions.date))
        .limit(SEARCH_LIMIT_DEFAULT);

  return rows.map((row) => ({
    ...row,
    ...buildTransactionViewFields(row),
  }));
}

/** Fetch badge counts for all classification and transfer filters. */
export async function getTransactionFilterCounts(
  householdId: string,
): Promise<TransactionFilterCounts> {
  const hid = eq(transactions.householdId, householdId);

  const [
    suggestions,
    needsReview,
    autoLabeled,
    uncategorized,
    linkedTransfers,
    transferReview,
  ] = await Promise.all([
    countWhere(and(hid, isNull(transactions.categoryId), isNotNull(transactions.suggestedCategoryId))),
    countWhere(and(hid, isNull(transactions.categoryId), isNull(transactions.suggestedCategoryId))),
    countWhere(and(hid, inArray(transactions.categorySource, ["merchant", "rule", "model"]))),
    countWhere(and(hid, isNull(transactions.categoryId))),
    countWhere(and(hid, isNotNull(transactions.transferGroupId))),
    db
      .select({ count: sql<string>`count(*)` })
      .from(transactionLinks)
      .where(and(eq(transactionLinks.householdId, householdId), eq(transactionLinks.confirmed, false)))
      .then(([row]) => Number(row?.count ?? 0)),
  ]);

  return { suggestions, needsReview, autoLabeled, uncategorized, linkedTransfers, transferReview };
}

/** Fetch category and account options for the transaction list UI. */
export async function getTransactionListOptions(householdId: string) {
  const [categoryRows, accountRows] = await Promise.all([
    db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(eq(categories.householdId, householdId)),
    db
      .select({ id: financialAccounts.id, name: financialAccounts.name })
      .from(financialAccounts)
      .where(eq(financialAccounts.householdId, householdId)),
  ]);
  return { categories: categoryRows, accounts: accountRows };
}

/** Fetch the paginated transaction list with column projections. */
export async function getTransactionListRows(
  householdId: string,
  filters: TransactionListFilters,
) {
  const where = buildWhereConditions(householdId, filters);
  const orderColumn = getOrderColumn(filters.sort);
  const orderDirection = filters.direction === "asc" ? asc : desc;

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
      categoryName: categories.name,
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
      accountName: financialAccounts.name,
    })
    .from(transactions)
    .innerJoin(financialAccounts, eq(financialAccounts.id, transactions.accountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(where)
    .orderBy(orderDirection(orderColumn), desc(transactions.id))
    .limit(PAGE_SIZE + 1)
    .offset((filters.page - 1) * PAGE_SIZE);

  const hasNextPage = rows.length > PAGE_SIZE;
  const visibleRows = rows.slice(0, PAGE_SIZE);

  return { rows: visibleRows, hasNextPage };
}

/**
 * Fetch transfer link and recurring bill enrichment data for a set of
 * visible transaction rows.
 */
export async function getTransactionEnrichment(
  householdId: string,
  visibleRows: { id: string; transferGroupId: string | null }[],
  categoryOptions: CategoryOption[],
) {
  const visibleIds = visibleRows.map((row) => row.id);
  const visibleTransferGroupIds = visibleRows
    .map((row) => row.transferGroupId)
    .filter((id): id is string => Boolean(id));

  const [transferRows, recurringRows] = await Promise.all([
    visibleTransferGroupIds.length
      ? db
          .select({
            groupId: transactionLinks.groupId,
            transactionId: transactionLinks.transactionId,
            role: transactionLinks.role,
            confidence: transactionLinks.confidence,
            confirmed: transactionLinks.confirmed,
            amountCents: transactions.amountCents,
            currency: transactions.currency,
            date: transactions.date,
            accountName: financialAccounts.name,
          })
          .from(transactionLinks)
          .innerJoin(transactions, eq(transactions.id, transactionLinks.transactionId))
          .innerJoin(financialAccounts, eq(financialAccounts.id, transactions.accountId))
          .where(
            and(
              eq(transactionLinks.householdId, householdId),
              inArray(transactionLinks.groupId, visibleTransferGroupIds),
            ),
          )
      : Promise.resolve([]),
    visibleIds.length
      ? db
          .select({
            transactionId: recurringBillHistory.transactionId,
            billName: recurringBills.name,
            cadence: recurringBills.cadence,
            nextDueDate: recurringBills.nextDueDate,
            isPossiblyCancelled: recurringBills.isPossiblyCancelled,
          })
          .from(recurringBillHistory)
          .innerJoin(recurringBills, eq(recurringBills.id, recurringBillHistory.billId))
          .where(
            and(
              eq(recurringBills.householdId, householdId),
              inArray(recurringBillHistory.transactionId, visibleIds),
            ),
          )
      : Promise.resolve([]),
  ]);

  // Index transfer rows for efficient lookup
  const transferRowsByTransactionId = new Map(
    transferRows.map((row) => [row.transactionId, row]),
  );
  const transferRowsByGroupId = new Map<string, typeof transferRows>();
  for (const row of transferRows) {
    const groupRows = transferRowsByGroupId.get(row.groupId) ?? [];
    groupRows.push(row);
    transferRowsByGroupId.set(row.groupId, groupRows);
  }
  const recurringByTransactionId = new Map(
    recurringRows
      .filter((row) => row.transactionId)
      .map((row) => [row.transactionId!, row]),
  );

  return { transferRowsByTransactionId, transferRowsByGroupId, recurringByTransactionId, categoryOptions };
}

/** Enrich visible rows with transfer, recurring, and suggestion data. */
export function enrichTransactionRows(
  visibleRows: Awaited<ReturnType<typeof getTransactionListRows>>["rows"],
  enrichment: Awaited<ReturnType<typeof getTransactionEnrichment>>,
) {
  const {
    transferRowsByTransactionId,
    transferRowsByGroupId,
    recurringByTransactionId,
    categoryOptions,
  } = enrichment;

  // Pre-index categories for O(1) lookup instead of O(n) .find() per row
  const categoryNameById = new Map(
    categoryOptions.map((c) => [c.id, c.name]),
  );

  return visibleRows.map((transaction) => {
    const link = transferRowsByTransactionId.get(transaction.id);
    const counterpart = link
      ? transferRowsByGroupId
          .get(link.groupId)
          ?.find((row) => row.transactionId !== transaction.id)
      : null;

    return {
      ...transaction,
      ...buildTransactionViewFields(transaction),
      suggestedCategoryName: transaction.suggestedCategoryId
        ? (categoryNameById.get(transaction.suggestedCategoryId) ?? null)
        : null,
      recurringBill: recurringByTransactionId.get(transaction.id) ?? null,
      transferSummary: link
        ? {
            groupId: link.groupId,
            role: link.role,
            confidence: link.confidence,
            confirmed: link.confirmed,
            counterpart: counterpart
              ? {
                  accountName: counterpart.accountName,
                  amountCents: counterpart.amountCents,
                  currency: counterpart.currency,
                  date: counterpart.date,
                }
              : null,
          }
        : transaction.transferGroupId
          ? {
              groupId: transaction.transferGroupId,
              role: "transfer",
              confidence: "1.00",
              confirmed: true,
              counterpart: null,
            }
          : null,
    };
  });
}
