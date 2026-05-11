import { Search, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { transactions } from "@/lib/demo-data";
import { formatMoney } from "@/lib/utils";

export default function SearchPage() {
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Search</CardTitle>
            <Badge>
              <Sparkles className="mr-1 size-3" /> AI-ready index
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-14 pl-10 text-base"
              placeholder="Find transactions, merchants, categories or notes"
            />
          </div>
          <div className="grid gap-3">
            {transactions.map((transaction) => (
              <div
                key={`${transaction.merchant}-${transaction.date}`}
                className="flex items-center justify-between rounded-3xl border bg-background/40 p-4"
              >
                <div>
                  <p className="font-medium">{transaction.merchant}</p>
                  <p className="text-sm text-muted-foreground">
                    {transaction.category} · {transaction.date}
                  </p>
                </div>
                <p className="font-semibold">{formatMoney(transaction.amount)}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
