import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  recurringBillHistory,
  recurringBills,
  transactions,
} from "@/db/schema";

import { inferSuggestedCategoryFromMatches } from "./categorization";

type MatchCategoryRow = {
  categoryId: string | null;
  categorySource: string | null;
};

async function applySuggestedCategory(
  billId: string,
  suggested: string | null,
): Promise<void> {
  await db
    .update(recurringBills)
    .set({
      suggestedCategoryId: suggested,
      updatedAt: new Date(),
    })
    .where(eq(recurringBills.id, billId));
}

/**
 * Update suggestedCategoryId for pending bills from matched transaction categories.
 * Never sets categoryId (approval remains explicit).
 */
export async function suggestCategoryForBill(
  householdId: string,
  billId: string,
): Promise<string | null> {
  const [bill] = await db
    .select({
      id: recurringBills.id,
      categoryId: recurringBills.categoryId,
    })
    .from(recurringBills)
    .where(
      and(
        eq(recurringBills.id, billId),
        eq(recurringBills.householdId, householdId),
      ),
    )
    .limit(1);

  if (!bill || bill.categoryId != null) return null;

  const rows = await db
    .select({
      categoryId: transactions.categoryId,
      categorySource: transactions.categorySource,
    })
    .from(recurringBillHistory)
    .innerJoin(
      transactions,
      eq(transactions.id, recurringBillHistory.transactionId),
    )
    .where(eq(recurringBillHistory.billId, billId));

  const suggested = inferSuggestedCategoryFromMatches(rows);
  await applySuggestedCategory(billId, suggested);
  return suggested;
}

/** Suggest categories for all pending bills in a household (Inngest step). */
export async function suggestCategoriesForHouseholdBills(
  householdId: string,
): Promise<{ updated: number }> {
  const pending = await db
    .select({ id: recurringBills.id })
    .from(recurringBills)
    .where(
      and(
        eq(recurringBills.householdId, householdId),
        isNull(recurringBills.categoryId),
        isNull(recurringBills.userEndedAt),
      ),
    );

  if (pending.length === 0) return { updated: 0 };

  const pendingIds = pending.map((bill) => bill.id);

  const matchRows = await db
    .select({
      billId: recurringBillHistory.billId,
      categoryId: transactions.categoryId,
      categorySource: transactions.categorySource,
    })
    .from(recurringBillHistory)
    .innerJoin(
      transactions,
      eq(transactions.id, recurringBillHistory.transactionId),
    )
    .where(inArray(recurringBillHistory.billId, pendingIds));

  const matchesByBill = new Map<string, MatchCategoryRow[]>();
  for (const row of matchRows) {
    const group = matchesByBill.get(row.billId) ?? [];
    group.push({
      categoryId: row.categoryId,
      categorySource: row.categorySource,
    });
    matchesByBill.set(row.billId, group);
  }

  let updated = 0;
  await db.transaction(async (tx) => {
    for (const billId of pendingIds) {
      const suggested = inferSuggestedCategoryFromMatches(
        matchesByBill.get(billId) ?? [],
      );
      await tx
        .update(recurringBills)
        .set({
          suggestedCategoryId: suggested,
          updatedAt: new Date(),
        })
        .where(eq(recurringBills.id, billId));
      if (suggested) updated += 1;
    }
  });

  return { updated };
}
