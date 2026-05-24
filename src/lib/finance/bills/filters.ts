/**
 * Client-safe bill list URL utilities.
 */

export const BILL_STATUS_FILTERS = [
  "current",
  "pending",
  "active",
  "review",
  "ended",
  "all",
] as const;

export type BillStatusFilter = (typeof BILL_STATUS_FILTERS)[number];

export const BILL_SORT_KEYS = [
  "dueDate",
  "name",
  "amount",
  "category",
  "status",
] as const;

export type BillSortKey = (typeof BILL_SORT_KEYS)[number];
export type BillSortDirection = "asc" | "desc";

export type BillListFilters = {
  status: BillStatusFilter;
  sort: BillSortKey;
  direction: BillSortDirection;
};

function isBillStatusFilter(value: string | undefined): value is BillStatusFilter {
  return Boolean(value && BILL_STATUS_FILTERS.includes(value as BillStatusFilter));
}

function isBillSortKey(value: string | undefined): value is BillSortKey {
  return Boolean(value && BILL_SORT_KEYS.includes(value as BillSortKey));
}

export function parseBillSearchParams(
  params: { status?: string; sort?: string; direction?: string } | undefined,
): BillListFilters {
  return {
    status: isBillStatusFilter(params?.status) ? params.status : "current",
    sort: isBillSortKey(params?.sort) ? params.sort : "dueDate",
    direction: params?.direction === "desc" ? "desc" : "asc",
  };
}

export function buildBillListHref(
  current: BillListFilters,
  overrides: Partial<BillListFilters> = {},
): string {
  const status = overrides.status ?? current.status;
  const sort = overrides.sort ?? current.sort;
  const direction = overrides.direction ?? current.direction;

  const params = new URLSearchParams();
  if (status !== "current") params.set("status", status);
  if (sort !== "dueDate") params.set("sort", sort);
  if (direction !== "asc") params.set("direction", direction);

  return `/bills${params.size ? `?${params}` : ""}`;
}
