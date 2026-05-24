import { TrendingUp } from "lucide-react";
import Link from "next/link";

import { BillRowActions } from "@/components/bills/bill-row-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatConfidencePercent } from "@/lib/classification/ui-state";
import type { BillListItem, CategoryOption } from "@/lib/finance/bills";
import {
  billAmountCentsForEdit,
  buildBillListHref,
  formatBillAmount,
  formatBillScheduleLabel,
  formatCadenceLabel,
  type BillListFilters,
  type BillSortKey,
} from "@/lib/finance/bills";
import { centsToDecimalString } from "@/lib/finance/money";
import { cn } from "@/lib/utils";

type BillsListProps = {
  bills: BillListItem[];
  categories: CategoryOption[];
  filters: BillListFilters;
};

const SORT_COLUMNS: { key: BillSortKey; label: string; className?: string }[] = [
  { key: "name", label: "Name" },
  { key: "dueDate", label: "Schedule" },
  { key: "amount", label: "Amount", className: "text-right" },
  { key: "category", label: "Category" },
  { key: "status", label: "Status" },
];

function sortHref(filters: BillListFilters, key: BillSortKey) {
  return buildBillListHref(filters, {
    sort: key,
    direction:
      filters.sort === key && filters.direction === "asc" ? "desc" : "asc",
  });
}

function sortIndicator(filters: BillListFilters, key: BillSortKey) {
  if (filters.sort !== key) return "";
  return filters.direction === "asc" ? " ↑" : " ↓";
}

export function BillsList({ bills, categories, filters }: BillsListProps) {
  return (
    <div className="grid gap-3">
      <div
        className="hidden gap-3 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto_auto]"
        aria-hidden
      >
        {SORT_COLUMNS.map((col) => (
          <Link
            key={col.key}
            className={cn("hover:text-foreground", col.className)}
            href={sortHref(filters, col.key)}
          >
            {col.label}
            {sortIndicator(filters, col.key)}
          </Link>
        ))}
        <span className="text-right">Actions</span>
      </div>

      {bills.map((bill) => {
        const isPending = bill.isActive && bill.categoryId == null;
        const schedule = formatBillScheduleLabel({
          isActive: bill.isActive,
          nextDueDate: bill.nextDueDate,
          userEndedAt: bill.userEndedAt,
          autoEndedAt: bill.autoEndedAt,
          lastPaymentDate: bill.lastPaymentDate,
          updatedAt: bill.updatedAt,
        });

        return (
          <article
            key={bill.id}
            aria-label={`${bill.name}, ${schedule}, ${formatBillAmount(bill)}${isPending ? ", needs approval" : ""}`}
            className="grid gap-3 rounded-3xl border bg-background/40 p-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto_auto] sm:items-center sm:gap-3"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="line-clamp-1 font-semibold">{bill.name}</p>
                {isPending ? (
                  <Badge
                    className="border-warning/40 bg-warning/15 text-warning-foreground"
                    aria-label="Needs approval"
                  >
                    Needs approval
                  </Badge>
                ) : null}
                {bill.isPossiblyCancelled ? (
                  <Badge
                    className="border-warning/40 bg-warning/15 text-warning-foreground"
                    aria-label="Possibly cancelled"
                  >
                    Possibly cancelled
                  </Badge>
                ) : null}
                {bill.isDuplicateSubscription ? (
                  <Badge
                    className="border-destructive bg-destructive/10 text-destructive"
                    aria-label="Possible duplicate subscription"
                  >
                    Duplicate?
                  </Badge>
                ) : null}
              </div>
              {bill.detectedCadenceConfidence ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Confidence:{" "}
                  {formatConfidencePercent(bill.detectedCadenceConfidence)}
                </p>
              ) : null}
              {bill.amountTrend && bill.amountTrend !== "stable" ? (
                <p className="mt-1 flex items-center gap-1 text-xs text-warning-foreground">
                  <TrendingUp className="size-3" aria-hidden />
                  Amount trending {bill.amountTrend}
                </p>
              ) : null}
              {isPending && bill.suggestedCategoryName ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Suggested: {bill.suggestedCategoryName}
                </p>
              ) : null}
            </div>

            <div className="text-sm text-muted-foreground">
              <p>{formatCadenceLabel(bill.cadence)}</p>
              <p className="mt-0.5">{schedule}</p>
            </div>

            <p className="font-semibold sm:text-right">{formatBillAmount(bill)}</p>

            <p className="text-sm text-muted-foreground">
              {bill.categoryName ??
                (isPending ? "Uncategorized" : "—")}
            </p>

            <div className="flex justify-end">
              <BillRowActions
                bill={{
                  id: bill.id,
                  name: bill.name,
                  cadence: bill.cadence,
                  isActive: bill.isActive,
                  isPossiblyCancelled: bill.isPossiblyCancelled,
                  categoryId: bill.categoryId,
                  suggestedCategoryId: bill.suggestedCategoryId,
                  expectedAmount: centsToDecimalString(
                    billAmountCentsForEdit(bill),
                  ),
                  nextDueDate: bill.nextDueDate,
                }}
                categories={categories}
              />
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function BillsListSortBar({ filters }: { filters: BillListFilters }) {
  return (
    <div className="flex flex-wrap gap-2 sm:hidden">
      {SORT_COLUMNS.map((col) => (
        <Button key={col.key} asChild size="sm" variant="outline">
          <Link href={sortHref(filters, col.key)}>
            {col.label}
            {sortIndicator(filters, col.key)}
          </Link>
        </Button>
      ))}
    </div>
  );
}
