import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { transactions } from "@/db/schema";
import { withApiHandler } from "@/lib/errors/api";
import { notFoundError, validationError } from "@/lib/errors/catalog";
import { getActiveHousehold } from "@/lib/finance/household";

/**
 * POST /api/transactions/[transactionId]/reject-suggestion
 *
 * Clears the amber-zone suggestion without applying it.
 * The transaction remains uncategorized for manual intervention.
 */
export const POST = withApiHandler(
  "transactions.reject-suggestion",
  async (
    _request: Request,
    { params }: { params: Promise<{ transactionId: string }> },
  ) => {
    const { transactionId } = await params;
    const household = await getActiveHousehold();

    const [transaction] = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.id, transactionId),
          eq(transactions.householdId, household.householdId),
        ),
      )
      .limit(1);

    if (!transaction) {
      throw notFoundError("Transaction not found.", {
        transactionId,
        householdId: household.householdId,
      });
    }

    if (!transaction.suggestedCategoryId) {
      throw validationError("No suggestion to reject.");
    }

    const [updated] = await db
      .update(transactions)
      .set({
        suggestedCategoryId: null,
        suggestedDescription: null,
        suggestedMerchantName: null,
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, transactionId))
      .returning();

    return NextResponse.json({ transaction: updated });
  },
);
