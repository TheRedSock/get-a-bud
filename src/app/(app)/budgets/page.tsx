import { CalendarDays } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { budgetRows } from "@/lib/demo-data";
import { formatMoney } from "@/lib/utils";

export default function BudgetsPage() {
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Main monthly budget</CardTitle>
            <Badge>
              <CalendarDays className="mr-1 size-3" /> Starts on payday, day 25
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5">
          {budgetRows.map((row) => (
            <div key={row.name} className="rounded-3xl border bg-background/40 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="font-semibold">{row.name}</p>
                  <p className="text-sm text-muted-foreground">Envelope enabled</p>
                </div>
                <p className="font-semibold">
                  {formatMoney(row.allocated - row.spent)} left
                </p>
              </div>
              <Progress value={(row.spent / row.allocated) * 100} />
              <p className="mt-2 text-sm text-muted-foreground">
                {formatMoney(row.spent)} spent of {formatMoney(row.allocated)}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Create budget</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4">
            <div className="grid gap-2">
              <Label>Name</Label>
              <Input placeholder="June zero-based budget" />
            </div>
            <div className="grid gap-2">
              <Label>Budget style</Label>
              <Input placeholder="monthly, weekly, zero-based, envelope" />
            </div>
            <div className="grid gap-2">
              <Label>Paycheck anchor day</Label>
              <Input inputMode="numeric" placeholder="25" />
            </div>
            <Button type="button">Create budget</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
