import { TrendingUp } from "lucide-react";
import Link from "next/link";

import { BillCategoryCell } from "@/components/bills/bill-category-cell";
import { BillRowActions } from "@/components/bills/bill-row-actions";
import { BillTableAmountCell } from "@/components/bills/bill-table-amount-cell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatConfidencePercent } from "@/lib/classification/ui-state";
import { billNeedsApproval } from "@/lib/finance/bills/approval";
import {
  billAmountCentsForEdit,
  formatBillAmount,
  formatBillScheduleLabel,
  formatCadenceLabel,
} from "@/lib/finance/bills/display";
import {
  buildBillListHref,
  type BillListFilters,
  type BillSortKey,
} from "@/lib/finance/bills/filters";
import type { BillListItem, CategoryOption } from "@/lib/finance/bills/list-types";
import { centsToDecimalString } from "@/lib/finance/money";
import { cn } from "@/lib/utils";

type BillsListProps = {
  bills: BillListItem[];
  categories: CategoryOption[];
  filters: BillListFilters;
};

/** Shared column template for header, rows (subgrid), and loading skeleton. */
export const BILLS_LIST_GRID_COLS =
  "sm:grid-cols-[minmax(0,1fr)_minmax(6.5rem,max-content)_minmax(7.5rem,max-content)_max-content_minmax(3.5rem,4rem)]";

const DESKTOP_HEADERS: {
  key: BillSortKey;
  label: string;
  className?: string;
}[] = [
  { key: "name", label: "Name" },
  { key: "dueDate", label: "Schedule" },
  { key: "amount", label: "Amount", className: "text-center" },
  { key: "category", label: "Category" },
];

const SORT_COLUMNS: { key: BillSortKey; label: string; className?: string }[] = [
  ...DESKTOP_HEADERS,
  { key: "status", label: "Status" },
];

const HEADER_CELL_CLASS =
  "text-xs font-medium uppercase tracking-wide text-muted-foreground";

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
    <div className={cn("grid gap-x-3 gap-y-3", BILLS_LIST_GRID_COLS)}>
      <div className="hidden sm:contents" aria-hidden>
        {DESKTOP_HEADERS.map((col, index) => (
          <Link
            key={col.key}
            className={cn(
              HEADER_CELL_CLASS,
              "hover:text-foreground",
              index === 0 && "pl-4",
              col.className,
            )}
            href={sortHref(filters, col.key)}
          >
            {col.label}
            {sortIndicator(filters, col.key)}
          </Link>
        ))}
        <span className={cn(HEADER_CELL_CLASS, "pr-4 text-right")}>Actions</span>
      </div>

      {bills.map((bill) => {
        const isPending = billNeedsApproval(bill);
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
            className="col-span-full grid gap-3 rounded-3xl border bg-background/40 py-4 sm:grid-cols-subgrid sm:items-center sm:gap-x-3 sm:gap-y-0"
          >
            <div className="min-w-0 pl-4">
              <div className="flex min-w-0 items-center gap-2">
                <p className="line-clamp-1 min-w-0 flex-1 font-semibold">
                  {bill.name}
                </p>
                {isPending ||
                bill.isPossiblyCancelled ||
                bill.isDuplicateSubscription ? (
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
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

            <div className="pl-4 text-sm text-muted-foreground sm:pl-0">
              <p>{formatCadenceLabel(bill.cadence)}</p>
              <p className="mt-0.5">{schedule}</p>
            </div>

            <div className="pl-4 sm:pl-0">
              <BillTableAmountCell bill={bill} />
            </div>

            <div className="max-w-[12rem] pl-4 sm:pl-0">
              <BillCategoryCell
                billId={bill.id}
                categories={categories}
                categoryId={bill.categoryId}
                categoryName={bill.categoryName}
                isPending={isPending}
                suggestedCategoryId={bill.suggestedCategoryId}
                suggestedCategoryName={bill.suggestedCategoryName}
              />
            </div>

            <div className="justify-self-end pl-4 pr-4 sm:pl-0 sm:pr-4">
              <BillRowActions
                bill={{
                  id: bill.id,
                  name: bill.name,
                  cadence: bill.cadence,
                  isActive: bill.isActive,
                  isPossiblyCancelled: bill.isPossiblyCancelled,
                  categoryId: bill.categoryId,
                  userEndedAt: bill.userEndedAt,
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
