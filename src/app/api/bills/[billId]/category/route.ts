import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import {
  categories,
  recurringBillHistory,
  recurringBills,
  transactions,
} from "@/db/schema";
import { inngest } from "@/inngest/client";
import { validateJsonBody, withApiHandler } from "@/lib/errors/api";
import { notFoundError } from "@/lib/errors/catalog";
import { getActiveHousehold } from "@/lib/finance/household";

const billCategorySchema = z.object({
  categoryId: z.string().min(1).nullable(),
  applyToTransactions: z.coerce.boolean().default(true),
});

export const PATCH = withApiHandler(
  "bills.update-category",
  async (
    request: Request,
    { params }: { params: Promise<{ billId: string }> },
  ) => {
    const { billId } = await params;
    const household = await getActiveHousehold();
    const input = await validateJsonBody(
      request,
      billCategorySchema,
      "Please choose a valid bill category.",
    );

    const [bill] = await db
      .select()
      .from(recurringBills)
      .where(
        and(
          eq(recurringBills.id, billId),
          eq(recurringBills.householdId, household.householdId),
        ),
      )
      .limit(1);

    if (!bill) {
      throw notFoundError("Recurring bill not found.", {
        billId,
        householdId: household.householdId,
      });
    }

    if (input.categoryId) {
      const [category] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(
          and(
            eq(categories.id, input.categoryId),
            eq(categories.householdId, household.householdId),
          ),
        )
        .limit(1);

      if (!category) {
        throw notFoundError("Choose a category from this household.", {
          categoryId: input.categoryId,
          householdId: household.householdId,
        });
      }
    }

    const [updatedBill] = await db
      .update(recurringBills)
      .set({ categoryId: input.categoryId, updatedAt: new Date() })
      .where(eq(recurringBills.id, bill.id))
      .returning();

    let applied = 0;

    if (input.applyToTransactions && input.categoryId) {
      const matchedRows = await db
        .select({
          id: transactions.id,
          categorySource: transactions.categorySource,
        })
        .from(recurringBillHistory)
        .innerJoin(
          transactions,
          eq(transactions.id, recurringBillHistory.transactionId),
        )
        .where(eq(recurringBillHistory.billId, bill.id));

      const applicableIds = matchedRows
        .filter((row) => row.categorySource !== "user")
        .map((row) => row.id);

      if (applicableIds.length > 0) {
        const updatedRows = await db
          .update(transactions)
          .set({
            categoryId: input.categoryId,
            categorySource: "user",
            categoryConfidence: "1.00",
            suggestedCategoryId: null,
            suggestedDescription: null,
            suggestedMerchantName: null,
            updatedAt: new Date(),
          })
          .where(inArray(transactions.id, applicableIds))
          .returning({ id: transactions.id });
        applied = updatedRows.length;
      }
    }

    if (applied > 0) {
      await inngest.send({
        name: "model.retrain",
        data: { householdId: household.householdId },
      });
    }

    return NextResponse.json({ bill: updatedBill, applied });
  },
);
