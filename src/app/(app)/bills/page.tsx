import { asc, eq, sql } from "drizzle-orm";
import { BellRing, TrendingUp } from "lucide-react";
import Link from "next/link";

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
import { db } from "@/db";
import { categories, recurringBills } from "@/db/schema";
import { formatConfidencePercent } from "@/lib/classification/ui-state";
import { getActiveHousehold } from "@/lib/finance/household";
import { formatCents } from "@/lib/finance/money";

type BillsPageProps = {
  searchParams?: Promise<{ status?: string }>;
};

const statusFilters = ["current", "review", "ended", "all"] as const;
type StatusFilter = (typeof statusFilters)[number];

function isStatusFilter(value: string | undefined): value is StatusFilter {
  return Boolean(value && statusFilters.includes(value as StatusFilter));
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
  const selectedStatus: StatusFilter = isStatusFilter(
    resolvedSearchParams?.status,
  )
    ? resolvedSearchParams.status
    : "current";
  const bills = await db
    .select()
    .from(recurringBills)
    .where(eq(recurringBills.householdId, household.householdId))
    .orderBy(sql`${recurringBills.nextDueDate} asc nulls last`, asc(recurringBills.name));
  const categoryOptions = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(eq(categories.householdId, household.householdId))
    .orderBy(asc(categories.name));
  const visibleBills = bills.filter((bill) => {
    if (selectedStatus === "all") return true;
    if (selectedStatus === "ended") return !bill.isActive;
    if (selectedStatus === "review") return bill.isPossiblyCancelled;
    return bill.isActive;
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Bill calendar</CardTitle>
          <div className="flex flex-wrap gap-2 pt-3">
            {statusFilters.map((filter) => (
              <Button
                key={filter}
                asChild
                size="sm"
                variant={selectedStatus === filter ? "default" : "outline"}
              >
                <Link href={`/bills?status=${filter}`}>
                  {filter === "current"
                    ? "Current"
                    : filter === "review"
                      ? "Needs review"
                      : filter === "ended"
                        ? "Ended"
                        : "All"}
                </Link>
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          {visibleBills.length ? (
            visibleBills.map((bill) => (
              <div
                key={bill.id}
                className="grid gap-4 rounded-3xl border bg-background/40 p-5 xl:grid-cols-[1fr_auto]"
              >
                <div>
                  <p className="font-semibold">{bill.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {dueSummary(bill.nextDueDate)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge>{bill.cadence.replace("_", " ")}</Badge>
                    {bill.detectedCadenceConfidence ? (
                      <Badge>
                        Confidence{" "}
                        {formatConfidencePercent(
                          bill.detectedCadenceConfidence,
                        )}
                      </Badge>
                    ) : null}
                    {bill.amountTrend && bill.amountTrend !== "stable" ? (
                      <Badge>{bill.amountTrend}</Badge>
                    ) : null}
                    {bill.isPossiblyCancelled ? (
                      <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-700">
                        Check status or ended
                      </Badge>
                    ) : null}
                    {bill.isDuplicateSubscription ? (
                      <Badge className="border-destructive/30 bg-destructive/10 text-destructive">
                        Possible duplicate
                      </Badge>
                    ) : null}
                  </div>
                  <RecurringBillCategoryAction
                    billId={bill.id}
                    categories={categoryOptions}
                    initialCategoryId={bill.categoryId}
                  />
                  <RecurringBillEditor
                    billId={bill.id}
                    cadence={bill.cadence}
                    expectedAmount={bill.expectedAmountCents != null ? String(bill.expectedAmountCents / 100) : null}
                    isActive={bill.isActive}
                    isPossiblyCancelled={bill.isPossiblyCancelled}
                    name={bill.name}
                    nextDueDate={bill.nextDueDate}
                  />
                  <BillTransactionsViewer billId={bill.id} />
                  <div className="mt-3">
                    <RejectRecurringBillButton billId={bill.id} />
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold">
                    {bill.originalCurrency && bill.lastOriginalAmountCents != null
                      ? formatCents(
                          bill.lastOriginalAmountCents,
                          bill.originalCurrency,
                        )
                      : formatCents(
                          bill.expectedAmountCents ?? bill.lastAmountCents ?? 0,
                        )}
                  </p>
                  <Badge className="mt-2">
                    {bill.isActive ? "Active" : "Ended"}
                  </Badge>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {bill.transactionCount ?? 0} matched transaction
                    {bill.transactionCount === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-3xl border border-dashed bg-background/40 p-8 text-center">
              <p className="font-semibold">
                {bills.length ? "No bills match this filter" : "No recurring bills yet"}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {bills.length
                  ? "Try another status filter to review ended or flagged bills."
                  : "Run recurring detection after importing transactions, or add bills manually."}
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
          <RunRecurringDetectionButton />
        </CardContent>
      </Card>
    </div>
  );
}
