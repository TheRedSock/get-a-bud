import { BellRing, TrendingUp } from "lucide-react";
import Link from "next/link";

import { BillsLiveHint } from "@/components/bills/bills-live-hint";
import {
  BillTransactionsViewer,
  RejectRecurringBillButton,
  RecurringBillCategoryAction,
  RecurringBillEditor,
  RunRecurringDetectionButton,
} from "@/components/recurring-bill-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatConfidencePercent } from "@/lib/classification/ui-state";
import {
  getBillCategoryOptions,
  getBillsForListing,
  type BillStatusFilter,
} from "@/lib/finance/bills";
import { getActiveHousehold } from "@/lib/finance/household";
import {
  billAmountCentsForEdit,
  formatBillAmount,
} from "@/lib/finance/bills";
import { centsToDecimalString } from "@/lib/finance/money";

type BillsPageProps = {
  searchParams?: Promise<{ status?: string }>;
};

const statusFilters = ["current", "review", "ended", "all"] as const;

function isStatusFilter(value: string | undefined): value is BillStatusFilter {
  return Boolean(value && statusFilters.includes(value as BillStatusFilter));
}

function dueSummary(nextDueDate: string | null) {
  if (!nextDueDate) return "No due date";

  const today = new Date();
  const dueDate = new Date(`${nextDueDate}T12:00:00Z`);
  const daysUntilDue = Math.ceil(
    (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (daysUntilDue < 0) {
    return `Past due by ${Math.abs(daysUntilDue)} day${
      Math.abs(daysUntilDue) === 1 ? "" : "s"
    }`;
  }

  if (daysUntilDue === 0) return "Due today";
  if (daysUntilDue <= 7) {
    return `Due in ${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"}`;
  }

  return `Due ${nextDueDate}`;
}

export default async function BillsPage({ searchParams }: BillsPageProps = {}) {
  const household = await getActiveHousehold();
  const resolvedSearchParams = await searchParams;
  const selectedStatus: BillStatusFilter = isStatusFilter(
    resolvedSearchParams?.status,
  )
    ? resolvedSearchParams.status
    : "current";

  const [bills, categoryOptions] = await Promise.all([
    getBillsForListing(household.householdId, selectedStatus),
    getBillCategoryOptions(household.householdId),
  ]);

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <BellRing className="size-5" /> Recurring bills
          </CardTitle>
          <RunRecurringDetectionButton />
        </CardHeader>
        <CardContent className="grid gap-4">
          <BillsLiveHint />
          <div className="flex flex-wrap gap-2">
            {statusFilters.map((status) => (
              <Button
                key={status}
                asChild
                size="sm"
                variant={selectedStatus === status ? "secondary" : "outline"}
              >
                <Link href={status === "current" ? "/bills" : `/bills?status=${status}`}>
                  {status[0].toUpperCase() + status.slice(1)}
                </Link>
              </Button>
            ))}
          </div>

          {bills.length ? (
            bills.map((bill) => (
              <div
                key={bill.id}
                className="flex flex-col gap-3 rounded-3xl border bg-background/40 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="grid gap-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{bill.name}</p>
                    {bill.isPossiblyCancelled && (
                      <Badge className="border-warning/40 bg-warning/15 text-warning-foreground">
                        Review
                      </Badge>
                    )}
                    {bill.isDuplicateSubscription && (
                      <Badge className="border-destructive bg-destructive/10 text-destructive">Duplicate?</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {bill.cadence} · {dueSummary(bill.nextDueDate)}
                  </p>
                  {bill.detectedCadenceConfidence && (
                    <p className="text-xs text-muted-foreground">
                      Confidence: {formatConfidencePercent(bill.detectedCadenceConfidence)}
                    </p>
                  )}
                  {bill.amountTrend && bill.amountTrend !== "stable" && (
                    <p className="flex items-center gap-1 text-xs text-warning-foreground">
                      <TrendingUp className="size-3" /> Amount trending{" "}
                      {bill.amountTrend}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{formatBillAmount(bill)}</p>
                  <RecurringBillEditor
                    billId={bill.id}
                    name={bill.name}
                    expectedAmount={centsToDecimalString(
                      billAmountCentsForEdit(bill),
                    )}
                    cadence={bill.cadence}
                    isActive={bill.isActive}
                    isPossiblyCancelled={bill.isPossiblyCancelled}
                    nextDueDate={bill.nextDueDate}
                  />
                  <RecurringBillCategoryAction
                    billId={bill.id}
                    initialCategoryId={bill.categoryId}
                    categories={categoryOptions}
                  />
                  <BillTransactionsViewer billId={bill.id} />
                  <RejectRecurringBillButton billId={bill.id} />
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-3xl border border-dashed bg-background/40 p-8 text-center">
              <p className="font-semibold">No bills found</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {selectedStatus === "current"
                  ? "Run detection or wait for recurring patterns to appear."
                  : `No ${selectedStatus} bills.`}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle>About bills</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            Bills are detected automatically from recurring transaction
            patterns. They help you forecast upcoming expenses and track
            subscription spending.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
