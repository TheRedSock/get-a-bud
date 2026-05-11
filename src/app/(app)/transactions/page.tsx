import { Search } from "lucide-react";
import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";

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
  }>;
};

export default async function TransactionsPage({
  searchParams,
}: TransactionsPageProps = {}) {
  const household = await getActiveHousehold();
  const resolvedSearchParams = await searchParams;
  const selectedAccountId = resolvedSearchParams?.accountId;
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
        status: transactions.status,
        excludedFromBudget: transactions.excludedFromBudget,
        accountName: financialAccounts.name,
      })
      .from(transactions)
      .innerJoin(
        financialAccounts,
        eq(financialAccounts.id, transactions.accountId),
      )
      .where(
        selectedAccountId
          ? and(
              eq(transactions.householdId, household.householdId),
              eq(transactions.accountId, selectedAccountId),
            )
          : eq(transactions.householdId, household.householdId),
      )
      .orderBy(desc(transactions.date))
      .limit(100),
    db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(eq(categories.householdId, household.householdId)),
    db
      .select({ id: financialAccounts.id, name: financialAccounts.name })
      .from(financialAccounts)
      .where(eq(financialAccounts.householdId, household.householdId)),
  ]);

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <Card>
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
              <Link href="/transactions">All accounts</Link>
            </Button>
            {accountRows.map((account) => (
              <Button
                key={account.id}
                asChild
                size="sm"
                variant={selectedAccountId === account.id ? "secondary" : "outline"}
              >
                <Link href={`/transactions?accountId=${account.id}`}>
                  {account.name}
                </Link>
              </Button>
            ))}
          </div>
          {rows.length ? (
            rows.map((transaction) => (
              <TransactionEditor
                key={transaction.id}
                categories={categoryRows}
                transaction={transaction}
              />
            ))
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

      <div className="grid gap-6">
        <BankSyncPanel />

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
      </div>
    </div>
  );
}
