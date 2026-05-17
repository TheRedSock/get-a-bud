import { CalendarDays } from "lucide-react";

import { CreateBudgetForm } from "@/components/forms/create-budget-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getBudgetsWithSpending } from "@/lib/finance/budget-calculations";
import { getActiveHousehold } from "@/lib/finance/household";
import { formatCents } from "@/lib/finance/money";

export default async function BudgetsPage() {
  const household = await getActiveHousehold();
  const budgets = await getBudgetsWithSpending(household.householdId);

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="grid gap-6">
        {budgets.length ? (
          budgets.map((budget) => (
            <Card key={budget.id}>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle>{budget.name}</CardTitle>
                  <Badge>
                    <CalendarDays className="mr-1 size-3" /> Starts day{" "}
                    {budget.periodStartDay}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-5">
                {budget.lines.length ? (
                  budget.lines.map((line) => {
                    const allocated = line.allocatedAmountCents;
                    const spent = line.spentAmountCents;
                    const remaining = allocated - spent;

                    return (
                      <div
                        key={line.budgetLineId}
                        className="rounded-3xl border bg-background/40 p-4"
                      >
                        <div className="mb-3 flex items-center justify-between">
                          <div>
                            <p className="font-semibold">{line.categoryName}</p>
                            {line.rolloverEnabled && (
                              <p className="text-sm text-muted-foreground">
                                Envelope enabled
                              </p>
                            )}
                          </div>
                          <p className="font-semibold">
                            {formatCents(remaining)} left
                          </p>
                        </div>
                        <Progress
                          value={allocated > 0 ? (spent / allocated) * 100 : 0}
                        />
                        <p className="mt-2 text-sm text-muted-foreground">
                          {formatCents(spent)} spent of {formatCents(allocated)}
                        </p>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No budget lines configured yet.
                  </p>
                )}
              </CardContent>
            </Card>
          ))
        ) : (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="font-semibold">No budgets yet</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Create your first budget to start tracking spending against
                categories.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create budget</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateBudgetForm />
        </CardContent>
      </Card>
    </div>
  );
}
