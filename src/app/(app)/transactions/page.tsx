import { Search } from "lucide-react";
import { desc, eq } from "drizzle-orm";

import { BankSyncPanel } from "@/components/bank-sync-panel";
import { TransactionEditor } from "@/components/transaction-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/db";
import { categories, transactions } from "@/db/schema";
import { getActiveHousehold } from "@/lib/finance/household";

export default async function TransactionsPage() {
  const household = await getActiveHousehold();
  const [rows, categoryRows] = await Promise.all([
    db
      .select()
      .from(transactions)
      .where(eq(transactions.householdId, household.householdId))
      .orderBy(desc(transactions.date))
      .limit(100),
    db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(eq(categories.householdId, household.householdId)),
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
