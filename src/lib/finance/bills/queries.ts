import {
  and,
  asc,
  desc,
  eq,
  isNotNull,
  isNull,
  sql,
  type SQL,
} from "drizzle-orm";

import { db } from "@/db";
import { categories, recurringBillHistory, recurringBills } from "@/db/schema";

import type { BillSortDirection, BillSortKey, BillStatusFilter } from "./filters";
import type { BillListItem, CategoryOption } from "./list-types";

export type { BillStatusFilter } from "./filters";
export type { BillListItem, CategoryOption } from "./list-types";

function statusCondition(status: BillStatusFilter): SQL | undefined {
  switch (status) {
    case "current":
      return eq(recurringBills.isActive, true);
    case "pending":
      return and(
        eq(recurringBills.isActive, true),
        isNull(recurringBills.categoryId),
      );
    case "active":
      return and(
        eq(recurringBills.isActive, true),
        isNotNull(recurringBills.categoryId),
      );
    case "review":
      return eq(recurringBills.isPossiblyCancelled, true);
    case "ended":
      return eq(recurringBills.isActive, false);
    case "all":
    default:
      return undefined;
  }
}

function orderByClause(
  sort: BillSortKey,
  direction: BillSortDirection,
): SQL[] {
  const dir = direction === "desc" ? desc : asc;
  switch (sort) {
    case "name":
      return [dir(recurringBills.name)];
    case "amount":
      return [
        sql`COALESCE(${recurringBills.expectedAmountCents}, ${recurringBills.lastAmountCents}, 0) ${sql.raw(direction === "desc" ? "DESC" : "ASC")}`,
      ];
    case "category":
      return [dir(categories.name), asc(recurringBills.name)];
    case "status":
      return [
        sql`CASE WHEN ${recurringBills.categoryId} IS NULL THEN 0 ELSE 1 END ASC`,
        sql`CASE WHEN ${recurringBills.isPossiblyCancelled} THEN 0 ELSE 1 END ASC`,
        asc(recurringBills.name),
      ];
    case "dueDate":
    default:
      return [
        sql`${recurringBills.nextDueDate} ${sql.raw(direction === "desc" ? "DESC NULLS LAST" : "ASC NULLS LAST")}`,
        asc(recurringBills.name),
      ];
  }
}

const lastPaymentSubquery = sql<string | null>`(
  SELECT MAX(${recurringBillHistory.date})
  FROM ${recurringBillHistory}
  WHERE ${recurringBillHistory.billId} = ${recurringBills.id}
)`.as("last_payment_date");

/**
 * Fetch bills for a household with SQL-level status filtering and sorting.
 */
export async function getBillsForListing(
  householdId: string,
  status: BillStatusFilter = "current",
  sort: BillSortKey = "dueDate",
  direction: BillSortDirection = "asc",
): Promise<BillListItem[]> {
  const conditions = [eq(recurringBills.householdId, householdId)];
  const statusSql = statusCondition(status);
  if (statusSql) conditions.push(statusSql);

  const includeLastPayment = status === "ended";

  const selectFields = {
    id: recurringBills.id,
    name: recurringBills.name,
    merchantPattern: recurringBills.merchantPattern,
    cadence: recurringBills.cadence,
    expectedAmountCents: recurringBills.expectedAmountCents,
    lastAmountCents: recurringBills.lastAmountCents,
    nextDueDate: recurringBills.nextDueDate,
    isActive: recurringBills.isActive,
    isPossiblyCancelled: recurringBills.isPossiblyCancelled,
    isDuplicateSubscription: recurringBills.isDuplicateSubscription,
    detectedCadenceConfidence: recurringBills.detectedCadenceConfidence,
    categoryId: recurringBills.categoryId,
    categoryName: categories.name,
    suggestedCategoryId: recurringBills.suggestedCategoryId,
    originalCurrency: recurringBills.originalCurrency,
    lastOriginalAmountCents: recurringBills.lastOriginalAmountCents,
    amountTrend: recurringBills.amountTrend,
    userEndedAt: recurringBills.userEndedAt,
    autoEndedAt: recurringBills.autoEndedAt,
    updatedAt: recurringBills.updatedAt,
    ...(includeLastPayment
      ? { lastPaymentDate: lastPaymentSubquery }
      : { lastPaymentDate: sql<string | null>`NULL`.as("last_payment_date") }),
  };

  const rows = await db
    .select({
      ...selectFields,
      suggestedCategoryName: sql<string | null>`(
        SELECT name FROM categories WHERE id = ${recurringBills.suggestedCategoryId}
      )`.as("suggested_category_name"),
    })
    .from(recurringBills)
    .leftJoin(categories, eq(categories.id, recurringBills.categoryId))
    .where(and(...conditions))
    .orderBy(...orderByClause(sort, direction));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    merchantPattern: row.merchantPattern,
    cadence: row.cadence,
    expectedAmountCents: row.expectedAmountCents,
    lastAmountCents: row.lastAmountCents,
    nextDueDate: row.nextDueDate,
    isActive: row.isActive,
    isPossiblyCancelled: row.isPossiblyCancelled,
    isDuplicateSubscription: row.isDuplicateSubscription,
    detectedCadenceConfidence: row.detectedCadenceConfidence,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    suggestedCategoryId: row.suggestedCategoryId,
    suggestedCategoryName: row.suggestedCategoryName,
    originalCurrency: row.originalCurrency,
    lastOriginalAmountCents: row.lastOriginalAmountCents,
    amountTrend: row.amountTrend,
    userEndedAt: row.userEndedAt,
    autoEndedAt: row.autoEndedAt,
    lastPaymentDate: row.lastPaymentDate,
    updatedAt: row.updatedAt,
  }));
}

/** Count of active bills awaiting user approval. */
export async function getPendingBillCount(householdId: string): Promise<number> {
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(recurringBills)
    .where(
      and(
        eq(recurringBills.householdId, householdId),
        eq(recurringBills.isActive, true),
        isNull(recurringBills.categoryId),
      ),
    );

  return row?.count ?? 0;
}

/** Fetch category options for the bills UI. */
export async function getBillCategoryOptions(
  householdId: string,
): Promise<CategoryOption[]> {
  return db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(eq(categories.householdId, householdId))
    .orderBy(asc(categories.name));
}
