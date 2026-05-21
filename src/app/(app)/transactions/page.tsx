import Link from "next/link";
import type { ReactNode } from "react";

import { BankSyncPanel } from "@/components/bank-sync-panel";
import { CreateTransactionForm } from "@/components/forms/create-transaction-form";
import { TransactionEditor } from "@/components/transaction-editor";
import { TransactionsReviewToolbar } from "@/components/transactions-review-toolbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveHousehold } from "@/lib/finance/household";
import {
  buildTransactionListHref,
  enrichTransactionRows,
  getTransactionEnrichment,
  getTransactionFilterCounts,
  getTransactionListOptions,
  getTransactionListRows,
  PAGE_SIZE,
  parseTransactionSearchParams,
  type SortKey,
  type TransactionListFilters,
} from "@/lib/finance/transactions";
import { getHouseholdConnections } from "@/lib/ingestion/enable-banking/queries";
import { cn } from "@/lib/utils";

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

export default async function TransactionsPage({
  searchParams,
}: TransactionsPageProps = {}) {
  const household = await getActiveHousehold();
  const filters = parseTransactionSearchParams(await searchParams);
  const householdId = household.householdId;

  // Parallel data fetches
  const [{ rows: visibleRows, hasNextPage }, counts, options, bankConnections] =
    await Promise.all([
      getTransactionListRows(householdId, filters),
      getTransactionFilterCounts(householdId),
      getTransactionListOptions(householdId),
      getHouseholdConnections(householdId),
    ]);

  // Secondary enrichment (transfer links, recurring bills)
  const enrichment = await getTransactionEnrichment(
    householdId,
    visibleRows,
    options.categories,
  );
  const enrichedRows = enrichTransactionRows(visibleRows, enrichment);

  // URL helpers
  const hrefFor = (overrides: Parameters<typeof buildTransactionListHref>[1]) =>
    buildTransactionListHref(filters, overrides);
  const sortHref = (key: SortKey) =>
    hrefFor({
      sort: key,
      direction: filters.sort === key && filters.direction === "desc" ? "asc" : "desc",
      page: 1,
    });
  const sortLabel = (key: SortKey) =>
    filters.sort === key ? (filters.direction === "asc" ? " ↑" : " ↓") : "";

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Transactions</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <TransactionsReviewToolbar
            counts={{
              autoLabeled: counts.autoLabeled,
              linkedTransfers: counts.linkedTransfers,
              needsReview: counts.needsReview,
              suggestions: counts.suggestions,
              transferReview: counts.transferReview,
              uncategorized: counts.uncategorized,
            }}
            params={{
              accountId: filters.accountId,
              classification: filters.classification,
              direction: filters.direction,
              q: filters.query,
              sort: filters.sort,
              transfer: filters.transfer,
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              asChild
              size="sm"
              variant={filters.accountId ? "outline" : "secondary"}
            >
              <Link href={hrefFor({ accountId: null, page: 1 })}>All accounts</Link>
            </Button>
            {options.accounts.map((account) => (
              <Button
                key={account.id}
                asChild
                size="sm"
                variant={filters.accountId === account.id ? "secondary" : "outline"}
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
                        categories={options.categories}
                        transaction={transaction}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Page {filters.page}, showing up to {PAGE_SIZE} transactions.
                </p>
                <div className="flex gap-2">
                  {filters.page === 1 ? (
                    <Button disabled size="sm" variant="outline">
                      Previous
                    </Button>
                  ) : (
                    <Button asChild size="sm" variant="outline">
                      <Link href={hrefFor({ page: filters.page - 1 })}>Previous</Link>
                    </Button>
                  )}
                  {hasNextPage ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={hrefFor({ page: filters.page + 1 })}>Next page</Link>
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
              accounts={options.accounts}
              categories={options.categories}
            />
          </CardContent>
        </Card>

        <BankSyncPanel initialConnections={bankConnections} />
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
    <th className={cn("px-4 py-3", className)}>
      <Link className="inline-flex items-center gap-1 hover:text-foreground" href={href}>
        {children}
      </Link>
    </th>
  );
}
