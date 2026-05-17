import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { categories, recurringBills } from "@/db/schema";

export type BillStatusFilter = "current" | "review" | "ended" | "all";

export type BillListItem = {
  id: string;
  name: string;
  merchantPattern: string;
  cadence: string;
  expectedAmountCents: number | null;
  lastAmountCents: number | null;
  nextDueDate: string | null;
  isActive: boolean;
  isPossiblyCancelled: boolean;
  isDuplicateSubscription: boolean;
  detectedCadenceConfidence: string | null;
  categoryId: string | null;
  originalCurrency: string | null;
  lastOriginalAmountCents: number | null;
  amountTrend: string | null;
};

export type CategoryOption = {
  id: string;
  name: string;
};

/**
 * Fetch bills for a household with SQL-level status filtering.
 * Pushes the filter to WHERE instead of fetching all and filtering in JS.
 */
export async function getBillsForListing(
  householdId: string,
  status: BillStatusFilter = "current",
): Promise<BillListItem[]> {
  const conditions = [eq(recurringBills.householdId, householdId)];

  // Push status filter to SQL
  if (status === "current") {
    conditions.push(eq(recurringBills.isActive, true));
  } else if (status === "review") {
    conditions.push(eq(recurringBills.isPossiblyCancelled, true));
  } else if (status === "ended") {
    conditions.push(eq(recurringBills.isActive, false));
  }
  // "all" has no additional filter

  const rows = await db
    .select({
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
      originalCurrency: recurringBills.originalCurrency,
      lastOriginalAmountCents: recurringBills.lastOriginalAmountCents,
      amountTrend: recurringBills.amountTrend,
    })
    .from(recurringBills)
    .where(and(...conditions))
    .orderBy(
      sql`${recurringBills.nextDueDate} asc nulls last`,
      asc(recurringBills.name),
    );

  return rows;
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
