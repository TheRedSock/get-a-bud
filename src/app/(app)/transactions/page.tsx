import { Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { transactions } from "@/lib/demo-data";
import { formatMoney } from "@/lib/utils";

export default function TransactionsPage() {
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
          {transactions.map((transaction) => (
            <div
              key={`${transaction.merchant}-${transaction.date}`}
              className="flex flex-col gap-3 rounded-3xl border bg-background/40 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-semibold">{transaction.merchant}</p>
                <p className="text-sm text-muted-foreground">{transaction.date}</p>
              </div>
              <div className="flex items-center justify-between gap-4 sm:justify-end">
                <Badge>{transaction.category}</Badge>
                <p className="min-w-24 text-right font-semibold">
                  {formatMoney(transaction.amount)}
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

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
  );
}
