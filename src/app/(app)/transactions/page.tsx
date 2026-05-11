import { Search } from "lucide-react";
import { desc, eq } from "drizzle-orm";

import { BankSyncPanel } from "@/components/bank-sync-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { getActiveHousehold } from "@/lib/finance/household";
import { formatMoney } from "@/lib/utils";

export default async function TransactionsPage() {
  const household = await getActiveHousehold();
  const rows = await db
    .select()
    .from(transactions)
    .where(eq(transactions.householdId, household.householdId))
    .orderBy(desc(transactions.date))
    .limit(100);

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
              <div
                key={transaction.id}
                className="flex flex-col gap-3 rounded-3xl border bg-background/40 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-semibold">
                    {transaction.merchantName ?? transaction.description}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {transaction.date} · {transaction.source.replace("_", " ")}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-4 sm:justify-end">
                  <Badge>{transaction.status}</Badge>
                  <p className="min-w-24 text-right font-semibold">
                    {formatMoney(Number(transaction.amount))}
                  </p>
                </div>
              </div>
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
