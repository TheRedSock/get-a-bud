import { asc, eq } from "drizzle-orm";
import { BellRing, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db";
import { recurringBills } from "@/db/schema";
import { getActiveHousehold } from "@/lib/finance/household";
import { formatMoney } from "@/lib/utils";

export default async function BillsPage() {
  const household = await getActiveHousehold();
  const bills = await db
    .select()
    .from(recurringBills)
    .where(eq(recurringBills.householdId, household.householdId))
    .orderBy(asc(recurringBills.nextDueDate));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Bill calendar</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {bills.length ? (
            bills.map((bill) => (
              <div
                key={bill.id}
                className="flex items-center justify-between rounded-3xl border bg-background/40 p-5"
              >
                <div>
                  <p className="font-semibold">{bill.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {bill.nextDueDate ? `Due ${bill.nextDueDate}` : "No due date"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">
                    {formatMoney(
                      Number(bill.expectedAmount ?? bill.lastAmount ?? 0),
                    )}
                  </p>
                  <Badge className="mt-2">
                    {bill.isActive ? "Active" : "Paused"}
                  </Badge>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-3xl border border-dashed bg-background/40 p-8 text-center">
              <p className="font-semibold">No recurring bills yet</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Run recurring detection after importing transactions, or add bills
                manually.
              </p>
            </div>
          )}
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
