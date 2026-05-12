import { eq } from "drizzle-orm";

import { CreateNetWorthItemForm } from "@/components/forms/create-net-worth-item-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db";
import { assets, financialAccounts, liabilities } from "@/db/schema";
import { getActiveHousehold } from "@/lib/finance/household";
import { formatMoney } from "@/lib/utils";

type NetWorthItem = {
  id: string;
  name: string;
  kind: string;
  value: number;
};

export default async function NetWorthPage() {
  const household = await getActiveHousehold();
  const [accountRows, assetRows, liabilityRows] = await Promise.all([
    db
      .select()
      .from(financialAccounts)
      .where(eq(financialAccounts.householdId, household.householdId)),
    db
      .select()
      .from(assets)
      .where(eq(assets.householdId, household.householdId)),
    db
      .select()
      .from(liabilities)
      .where(eq(liabilities.householdId, household.householdId)),
  ]);

  const items: NetWorthItem[] = [
    ...accountRows.map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind,
      value: Number(a.currentBalance),
    })),
    ...assetRows.map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind,
      value: Number(a.estimatedValue),
    })),
    ...liabilityRows.map((l) => ({
      id: l.id,
      name: l.name,
      kind: l.kind,
      value: -Number(l.currentBalance),
    })),
  ];

  const netWorth = items.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <Card>
        <CardHeader>
          <CardTitle>Net worth snapshot</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-6 text-5xl font-semibold">{formatMoney(netWorth)}</p>
          <div className="grid gap-3">
            {items.length ? (
              items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-3xl border bg-background/40 p-4"
                >
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-sm text-muted-foreground">{item.kind}</p>
                  </div>
                  <p
                    className={
                      item.value < 0 ? "text-destructive" : "text-foreground"
                    }
                  >
                    {formatMoney(item.value)}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-3xl border border-dashed bg-background/40 p-8 text-center">
                <p className="font-semibold">No items yet</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Add accounts, assets or liabilities to see your net worth.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add asset or debt</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateNetWorthItemForm />
        </CardContent>
      </Card>
    </div>
  );
}
