import { Search } from "lucide-react";
import { and, asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import type { ReactNode } from "react";

import { BankSyncPanel } from "@/components/bank-sync-panel";
import { TransactionEditor } from "@/components/transaction-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/db";
import { categories, financialAccounts, transactions } from "@/db/schema";
import { getActiveHousehold } from "@/lib/finance/household";

type TransactionsPageProps = {
  searchParams?: Promise<{
    accountId?: string;
    direction?: string;
    page?: string;
    sort?: string;
  }>;
};

const pageSize = 50;
const sortKeys = ["date", "description", "account", "category", "status", "amount"] as const;

type SortKey = (typeof sortKeys)[number];
type SortDirection = "asc" | "desc";

function isSortKey(value: string | undefined): value is SortKey {
  return Boolean(value && sortKeys.includes(value as SortKey));
}

export default async function TransactionsPage({
  searchParams,
}: TransactionsPageProps = {}) {
  const household = await getActiveHousehold();
  const resolvedSearchParams = await searchParams;
  const selectedAccountId = resolvedSearchParams?.accountId;
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
    status: transactions.status,
    amount: transactions.amount,
  } satisfies Record<SortKey, unknown>;
  const sortColumn = sortColumns[sort];
  const orderDirection = direction === "asc" ? asc : desc;
  const hrefFor = (overrides: {
    accountId?: string | null;
    direction?: SortDirection;
    page?: number;
    sort?: SortKey;
  }) => {
    const params = new URLSearchParams();
    const nextAccountId =
      overrides.accountId === undefined ? selectedAccountId : overrides.accountId;
    const nextSort = overrides.sort ?? sort;
    const nextDirection = overrides.direction ?? direction;
    const nextPage = overrides.page ?? page;

    if (nextAccountId) params.set("accountId", nextAccountId);
    if (nextSort !== "date") params.set("sort", nextSort);
    if (nextDirection !== "desc") params.set("direction", nextDirection);
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
  const [rows, categoryRows, accountRows] = await Promise.all([
    db
      .select({
        id: transactions.id,
        source: transactions.source,
        amount: transactions.amount,
        currency: transactions.currency,
        date: transactions.date,
        merchantName: transactions.merchantName,
        description: transactions.description,
        notes: transactions.notes,
        categoryId: transactions.categoryId,
        categoryName: categories.name,
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
      .where(
        selectedAccountId
          ? and(
              eq(transactions.householdId, household.householdId),
              eq(transactions.accountId, selectedAccountId),
            )
          : eq(transactions.householdId, household.householdId),
      )
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
  ]);
  const hasNextPage = rows.length > pageSize;
  const visibleRows = rows.slice(0, pageSize);

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Transactions</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-10" placeholder="Search by merchant, note or category" />
          </div>
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
          {visibleRows.length ? (
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
                      <SortableHeader href={sortHref("status")}>
                        Status{sortLabel("status")}
                      </SortableHeader>
                      <SortableHeader className="text-right" href={sortHref("amount")}>
                        Amount{sortLabel("amount")}
                      </SortableHeader>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((transaction) => (
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
                  <Button asChild disabled={page === 1} size="sm" variant="outline">
                    <Link
                      aria-disabled={page === 1}
                      href={page === 1 ? "#" : hrefFor({ page: page - 1 })}
                    >
                      Previous
                    </Link>
                  </Button>
                  <Button asChild disabled={!hasNextPage} size="sm" variant="outline">
                    <Link
                      aria-disabled={!hasNextPage}
                      href={hasNextPage ? hrefFor({ page: page + 1 }) : "#"}
                    >
                      Next page
                    </Link>
                  </Button>
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
            <form className="grid gap-4">
              <div className="grid gap-2">
                <Label>Description</Label>
                <Input placeholder="Merchant or note" />
              </div>
              <div className="grid gap-2">
                <Label>Amount</Label>
                <Input inputMode="decimal" placeholder="-299" />
              </div>
              <div className="grid gap-2">
                <Label>Category</Label>
                <Input placeholder="Groceries" />
              </div>
              <Button type="button">Save transaction</Button>
            </form>
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
