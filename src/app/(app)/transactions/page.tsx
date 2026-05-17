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
import Link from "next/link";
import type { ReactNode } from "react";

import { BankSyncPanel } from "@/components/bank-sync-panel";
import { CreateTransactionForm } from "@/components/forms/create-transaction-form";
import { TransactionEditor } from "@/components/transaction-editor";
import { TransactionsReviewToolbar } from "@/components/transactions-review-toolbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db";
import {
  categories,
  financialAccounts,
  recurringBillHistory,
  recurringBills,
  transactionLinks,
  transactions,
} from "@/db/schema";
import { getActiveHousehold } from "@/lib/finance/household";

type TransactionsPageProps = {
  searchParams?: Promise<{
    accountId?: string;
    classification?: string;
    direction?: string;
    page?: string;
    q?: string;
    sort?: string;
    transfer?: string;
  }>;
};

const pageSize = 50;
const sortKeys = ["date", "description", "account", "category", "amount"] as const;
const classificationFilters = [
  "all",
  "suggestions",
  "needs-review",
  "auto-labeled",
  "user-labeled",
  "uncategorized",
] as const;
const transferFilters = ["all", "linked", "review", "one-sided"] as const;
const transferTypes = ["internal_transfer", "investment"] as const;

type SortKey = (typeof sortKeys)[number];
type SortDirection = "asc" | "desc";
type ClassificationFilter = (typeof classificationFilters)[number];
type TransferFilter = (typeof transferFilters)[number];

function isSortKey(value: string | undefined): value is SortKey {
  return Boolean(value && sortKeys.includes(value as SortKey));
}

function isClassificationFilter(
  value: string | undefined,
): value is ClassificationFilter {
  return Boolean(
    value && classificationFilters.includes(value as ClassificationFilter),
  );
}

function isTransferFilter(value: string | undefined): value is TransferFilter {
  return Boolean(value && transferFilters.includes(value as TransferFilter));
}

function countTransactions(where: SQL | undefined) {
  return db
    .select({ count: sql<string>`count(*)` })
    .from(transactions)
    .where(where)
    .then(([row]) => Number(row?.count ?? 0));
}

export default async function TransactionsPage({
  searchParams,
}: TransactionsPageProps = {}) {
  const household = await getActiveHousehold();
  const resolvedSearchParams = await searchParams;
  const selectedAccountId = resolvedSearchParams?.accountId;
  const query = resolvedSearchParams?.q?.trim() ?? "";
  const selectedClassification: ClassificationFilter = isClassificationFilter(
    resolvedSearchParams?.classification,
  )
    ? resolvedSearchParams.classification
    : "all";
  const selectedTransfer: TransferFilter = isTransferFilter(
    resolvedSearchParams?.transfer,
  )
    ? resolvedSearchParams.transfer
    : "all";
  const page = Math.max(Number(resolvedSearchParams?.page ?? 1), 1);
  const sort: SortKey = isSortKey(resolvedSearchParams?.sort)
    ? resolvedSearchParams.sort
    : "date";
  const direction: SortDirection =
    resolvedSearchParams?.direction === "asc" ? "asc" : "desc";
  const sortColumns = {
    date: transactions.date,
    description: transactions.description,
    account: financialAccounts.name,
    category: categories.name,
    amount: transactions.amountCents,
  } satisfies Record<SortKey, unknown>;
  const sortColumn = sortColumns[sort];
  const orderDirection = direction === "asc" ? asc : desc;
  const hrefFor = (overrides: {
    accountId?: string | null;
    classification?: ClassificationFilter;
    direction?: SortDirection;
    page?: number;
    q?: string | null;
    sort?: SortKey;
    transfer?: TransferFilter;
  }) => {
    const params = new URLSearchParams();
    const nextAccountId =
      overrides.accountId === undefined ? selectedAccountId : overrides.accountId;
    const nextClassification =
      overrides.classification ?? selectedClassification;
    const nextSort = overrides.sort ?? sort;
    const nextDirection = overrides.direction ?? direction;
    const nextPage = overrides.page ?? page;
    const nextQuery = overrides.q === undefined ? query : overrides.q;
    const nextTransfer = overrides.transfer ?? selectedTransfer;

    if (nextAccountId) params.set("accountId", nextAccountId);
    if (nextQuery) params.set("q", nextQuery);
    if (nextSort !== "date") params.set("sort", nextSort);
    if (nextDirection !== "desc") params.set("direction", nextDirection);
    if (nextClassification !== "all") {
      params.set("classification", nextClassification);
    }
    if (nextTransfer !== "all") params.set("transfer", nextTransfer);
    if (nextPage > 1) params.set("page", String(nextPage));

    return `/transactions${params.size ? `?${params}` : ""}`;
  };
  const sortHref = (key: SortKey) =>
    hrefFor({
      sort: key,
      direction: sort === key && direction === "desc" ? "asc" : "desc",
      page: 1,
    });
  const sortLabel = (key: SortKey) =>
    sort === key ? (direction === "asc" ? " ↑" : " ↓") : "";

  const baseConditions: SQL[] = [eq(transactions.householdId, household.householdId)];
  if (selectedAccountId) {
    baseConditions.push(eq(transactions.accountId, selectedAccountId));
  }
  if (query) {
    baseConditions.push(
      or(
        ilike(transactions.searchText, `%${query}%`),
        ilike(categories.name, `%${query}%`),
      )!,
    );
  }

  const classificationConditions: Partial<Record<ClassificationFilter, SQL>> = {
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
  const transferConditions: Partial<Record<TransferFilter, SQL>> = {
    linked: isNotNull(transactions.transferGroupId),
    review: sql`exists (
      select 1 from transaction_links
      where transaction_links.transaction_id = ${transactions.id}
        and transaction_links.confirmed = false
    )`,
    "one-sided": and(
      isNull(transactions.transferGroupId),
      eq(transactions.excludedFromBudget, true),
      inArray(transactions.transactionType, transferTypes),
    )!,
  };
  const whereConditions = [...baseConditions];
  if (selectedClassification !== "all") {
    whereConditions.push(classificationConditions[selectedClassification]!);
  }
  if (selectedTransfer !== "all") {
    whereConditions.push(transferConditions[selectedTransfer]!);
  }
  const where = and(...whereConditions);

  const [
    rows,
    categoryRows,
    accountRows,
    suggestionsCount,
    needsReviewCount,
    autoLabeledCount,
    uncategorizedCount,
    linkedTransfersCount,
    transferReviewCount,
  ] = await Promise.all([
    db
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
      .innerJoin(
        financialAccounts,
        eq(financialAccounts.id, transactions.accountId),
      )
      .leftJoin(categories, eq(categories.id, transactions.categoryId))
      .where(where)
      .orderBy(orderDirection(sortColumn), desc(transactions.id))
      .limit(pageSize + 1)
      .offset((page - 1) * pageSize),
    db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(eq(categories.householdId, household.householdId)),
    db
      .select({ id: financialAccounts.id, name: financialAccounts.name })
      .from(financialAccounts)
      .where(eq(financialAccounts.householdId, household.householdId)),
    countTransactions(
      and(
        eq(transactions.householdId, household.householdId),
        isNull(transactions.categoryId),
        isNotNull(transactions.suggestedCategoryId),
      ),
    ),
    countTransactions(
      and(
        eq(transactions.householdId, household.householdId),
        isNull(transactions.categoryId),
        isNull(transactions.suggestedCategoryId),
      ),
    ),
    countTransactions(
      and(
        eq(transactions.householdId, household.householdId),
        inArray(transactions.categorySource, ["merchant", "rule", "model"]),
      ),
    ),
    countTransactions(
      and(
        eq(transactions.householdId, household.householdId),
        isNull(transactions.categoryId),
      ),
    ),
    countTransactions(
      and(
        eq(transactions.householdId, household.householdId),
        isNotNull(transactions.transferGroupId),
      ),
    ),
    db
      .select({ count: sql<string>`count(*)` })
      .from(transactionLinks)
      .where(
        and(
          eq(transactionLinks.householdId, household.householdId),
          eq(transactionLinks.confirmed, false),
        ),
      )
      .then(([row]) => Number(row?.count ?? 0)),
  ]);
  const hasNextPage = rows.length > pageSize;
  const visibleRows = rows.slice(0, pageSize);
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
          .innerJoin(
            transactions,
            eq(transactions.id, transactionLinks.transactionId),
          )
          .innerJoin(
            financialAccounts,
            eq(financialAccounts.id, transactions.accountId),
          )
          .where(
            and(
              eq(transactionLinks.householdId, household.householdId),
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
          .innerJoin(
            recurringBills,
            eq(recurringBills.id, recurringBillHistory.billId),
          )
          .where(
            and(
              eq(recurringBills.householdId, household.householdId),
              inArray(recurringBillHistory.transactionId, visibleIds),
            ),
          )
      : Promise.resolve([]),
  ]);
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
  const enrichedRows = visibleRows.map((transaction) => {
    const link = transferRowsByTransactionId.get(transaction.id);
    const counterpart = link
      ? transferRowsByGroupId
          .get(link.groupId)
          ?.find((row) => row.transactionId !== transaction.id)
      : null;

    return {
      ...transaction,
      suggestedCategoryName:
        categoryRows.find((category) => category.id === transaction.suggestedCategoryId)
          ?.name ?? null,
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

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Transactions</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <TransactionsReviewToolbar
            counts={{
              autoLabeled: autoLabeledCount,
              linkedTransfers: linkedTransfersCount,
              needsReview: needsReviewCount,
              suggestions: suggestionsCount,
              transferReview: transferReviewCount,
              uncategorized: uncategorizedCount,
            }}
            params={{
              accountId: selectedAccountId,
              classification: selectedClassification,
              direction,
              q: query,
              sort,
              transfer: selectedTransfer,
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              asChild
              size="sm"
              variant={selectedAccountId ? "outline" : "secondary"}
            >
              <Link href={hrefFor({ accountId: null, page: 1 })}>All accounts</Link>
            </Button>
            {accountRows.map((account) => (
              <Button
                key={account.id}
                asChild
                size="sm"
                variant={selectedAccountId === account.id ? "secondary" : "outline"}
              >
                <Link href={hrefFor({ accountId: account.id, page: 1 })}>
                  {account.name}
                </Link>
              </Button>
            ))}
          </div>
          {enrichedRows.length ? (
            <>
              <div className="overflow-x-auto rounded-3xl border bg-background/40">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <SortableHeader href={sortHref("date")}>
                        Date{sortLabel("date")}
                      </SortableHeader>
                      <SortableHeader href={sortHref("description")}>
                        Description{sortLabel("description")}
                      </SortableHeader>
                      <SortableHeader href={sortHref("account")}>
                        Account{sortLabel("account")}
                      </SortableHeader>
                      <SortableHeader href={sortHref("category")}>
                        Category{sortLabel("category")}
                      </SortableHeader>
                      <SortableHeader className="text-right" href={sortHref("amount")}>
                        Amount{sortLabel("amount")}
                      </SortableHeader>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrichedRows.map((transaction) => (
                      <TransactionEditor
                        key={transaction.id}
                        categories={categoryRows}
                        transaction={transaction}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Page {page}, showing up to {pageSize} transactions.
                </p>
                <div className="flex gap-2">
                  {page === 1 ? (
                    <Button disabled size="sm" variant="outline">
                      Previous
                    </Button>
                  ) : (
                    <Button asChild size="sm" variant="outline">
                      <Link href={hrefFor({ page: page - 1 })}>Previous</Link>
                    </Button>
                  )}
                  {hasNextPage ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={hrefFor({ page: page + 1 })}>Next page</Link>
                    </Button>
                  ) : (
                    <Button disabled size="sm" variant="outline">
                      Next page
                    </Button>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-3xl border border-dashed bg-background/40 p-8 text-center">
              <p className="font-semibold">No transactions yet</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Sync a connected bank or add a manual transaction once an account
                exists.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid content-start gap-6 xl:sticky xl:top-24">
        <Card>
          <CardHeader>
            <CardTitle>Manual transaction</CardTitle>
          </CardHeader>
          <CardContent>
            <CreateTransactionForm
              accounts={accountRows}
              categories={categoryRows}
            />
          </CardContent>
        </Card>

        <BankSyncPanel />
      </div>
    </div>
  );
}

function SortableHeader({
  children,
  className = "",
  href,
}: {
  children: ReactNode;
  className?: string;
  href: string;
}) {
  return (
    <th className={`px-4 py-3 ${className}`}>
      <Link className="inline-flex items-center gap-1 hover:text-foreground" href={href}>
        {children}
      </Link>
    </th>
  );
}
