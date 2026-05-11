import { BellRing, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { bills } from "@/lib/demo-data";
import { formatMoney } from "@/lib/utils";

export default function BillsPage() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Bill calendar</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {bills.map((bill) => (
            <div
              key={bill.name}
              className="flex items-center justify-between rounded-3xl border bg-background/40 p-5"
            >
              <div>
                <p className="font-semibold">{bill.name}</p>
                <p className="text-sm text-muted-foreground">Due {bill.due}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold">{formatMoney(bill.amount)}</p>
                <Badge className="mt-2">{bill.status}</Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Detection insights</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="rounded-3xl bg-secondary/60 p-5">
            <BellRing className="mb-3 size-5 text-primary" />
            <p className="font-semibold">Renewal reminders are scaffolded</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Inngest jobs can batch reminders once email, push or SMS delivery is
              selected.
            </p>
          </div>
          <div className="rounded-3xl bg-secondary/60 p-5">
            <TrendingUp className="mb-3 size-5 text-primary" />
            <p className="font-semibold">Price increase watch</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Recurring merchants store a price threshold so future imports can flag
              material changes.
            </p>
          </div>
          <Button variant="outline">Run recurring detection</Button>
        </CardContent>
      </Card>
    </div>
  );
}
