import { BellRing } from "lucide-react";
import Link from "next/link";

import { BillsList, BillsListSortBar } from "@/components/bills/bills-list";
import { CreateBillForm } from "@/components/bills/create-bill-form";
import { BillsLiveHint } from "@/components/bills/bills-live-hint";
import { RunRecurringDetectionButton } from "@/components/recurring-bill-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildBillListHref,
  getBillCategoryOptions,
  getBillsForListing,
  getPendingBillCount,
  parseBillSearchParams,
} from "@/lib/finance/bills";
import { getActiveHousehold } from "@/lib/finance/household";

type BillsPageProps = {
  searchParams?: Promise<{ status?: string; sort?: string; direction?: string }>;
};

const statusTabs = [
  { value: "current", label: "Current" },
  { value: "pending", label: "Pending" },
  { value: "active", label: "Active" },
  { value: "review", label: "Review" },
  { value: "ended", label: "Ended" },
  { value: "all", label: "All" },
] as const;

export default async function BillsPage({ searchParams }: BillsPageProps = {}) {
  const household = await getActiveHousehold();
  const resolvedSearchParams = await searchParams;
  const filters = parseBillSearchParams(resolvedSearchParams);

  const [bills, categoryOptions, pendingCount] = await Promise.all([
    getBillsForListing(
      household.householdId,
      filters.status,
      filters.sort,
      filters.direction,
    ),
    getBillCategoryOptions(household.householdId),
    getPendingBillCount(household.householdId),
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

          {pendingCount > 0 ? (
            <div
              className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm"
              role="status"
            >
              <span className="font-medium text-warning-foreground">
                {pendingCount} bill{pendingCount === 1 ? "" : "s"} need approval
              </span>
              {filters.status !== "pending" ? (
                <>
                  {" "}
                  <Link
                    className="font-semibold underline underline-offset-2"
                    href={buildBillListHref(filters, { status: "pending" })}
                  >
                    Review pending
                  </Link>
                </>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {statusTabs.map((tab) => (
              <Button
                key={tab.value}
                asChild
                size="sm"
                variant={filters.status === tab.value ? "secondary" : "outline"}
              >
                <Link href={buildBillListHref(filters, { status: tab.value })}>
                  {tab.label}
                </Link>
              </Button>
            ))}
          </div>

          <BillsListSortBar filters={filters} />

          {bills.length ? (
            <BillsList
              bills={bills}
              categories={categoryOptions}
              filters={filters}
            />
          ) : (
            <div className="rounded-3xl border border-dashed bg-background/40 p-8 text-center">
              <p className="font-semibold">No bills found</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {filters.status === "current"
                  ? "Run detection or wait for recurring patterns to appear."
                  : filters.status === "pending"
                    ? "No bills are waiting for approval."
                    : `No ${filters.status} bills.`}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid h-fit gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Add bill manually</CardTitle>
          </CardHeader>
          <CardContent>
            <CreateBillForm categories={categoryOptions} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>About bills</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>
              Bills are detected automatically from recurring transaction
              patterns. Approve detected bills to include them in forecasts.
            </p>
            <p className="mt-3">
              Internal account transfers are excluded from bills — they do not
              affect your budget totals. Recurring transfer visibility may be
              added separately later.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
