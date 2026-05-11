import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { netWorthItems } from "@/lib/demo-data";
import { formatMoney } from "@/lib/utils";

export default function NetWorthPage() {
  const netWorth = netWorthItems.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <Card>
        <CardHeader>
          <CardTitle>Net worth snapshot</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-6 text-5xl font-semibold">{formatMoney(netWorth)}</p>
          <div className="grid gap-3">
            {netWorthItems.map((item) => (
              <div
                key={item.name}
                className="flex items-center justify-between rounded-3xl border bg-background/40 p-4"
              >
                <p className="font-medium">{item.name}</p>
                <p className={item.value < 0 ? "text-destructive" : "text-foreground"}>
                  {formatMoney(item.value)}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add asset or debt</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4">
            <div className="grid gap-2">
              <Label>Name</Label>
              <Input placeholder="Cabin estimate, mortgage, stocks..." />
            </div>
            <div className="grid gap-2">
              <Label>Type</Label>
              <Input placeholder="asset or liability" />
            </div>
            <div className="grid gap-2">
              <Label>Value</Label>
              <Input inputMode="decimal" placeholder="500000" />
            </div>
            <Button type="button">
              <Plus className="size-4" /> Save item
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
