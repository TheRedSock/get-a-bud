import { CreateNetWorthItemForm } from "@/components/forms/create-net-worth-item-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveHousehold } from "@/lib/finance/household";
import { formatCents } from "@/lib/finance/money";
import { getNetWorthSummary } from "@/lib/finance/net-worth";

export default async function NetWorthPage() {
  const household = await getActiveHousehold();
  const { items, netWorth } = await getNetWorthSummary(household.householdId);

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <Card>
        <CardHeader>
          <CardTitle>Net worth snapshot</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-6 text-5xl font-semibold">{formatCents(netWorth)}</p>
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
                    {formatCents(item.value)}
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
