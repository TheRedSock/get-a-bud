import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { recurringBills } from "@/db/schema";
import { validateJsonBody, withApiHandler } from "@/lib/errors/api";
import { notFoundError } from "@/lib/errors/catalog";
import { getActiveHousehold } from "@/lib/finance/household";

const billUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  cadence: z
    .enum([
      "weekly",
      "biweekly",
      "monthly",
      "quarterly",
      "semi_annual",
      "yearly",
      "unknown",
    ])
    .optional(),
  expectedAmount: z.coerce.number().nonnegative().nullable().optional(),
  nextDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  isActive: z.boolean().optional(),
  isPossiblyCancelled: z.boolean().optional(),
});

export const PATCH = withApiHandler(
  "bills.update",
  async (
    request: Request,
    { params }: { params: Promise<{ billId: string }> },
  ) => {
    const { billId } = await params;
    const household = await getActiveHousehold();
    const input = await validateJsonBody(
      request,
      billUpdateSchema,
      "Please provide valid bill details.",
    );

    const [bill] = await db
      .select({ id: recurringBills.id })
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

    const [updatedBill] = await db
      .update(recurringBills)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.cadence !== undefined ? { cadence: input.cadence } : {}),
        ...(input.expectedAmount !== undefined
          ? {
              expectedAmount:
                input.expectedAmount == null
                  ? null
                  : input.expectedAmount.toFixed(2),
            }
          : {}),
        ...(input.nextDueDate !== undefined
          ? { nextDueDate: input.nextDueDate }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.isPossiblyCancelled !== undefined
          ? { isPossiblyCancelled: input.isPossiblyCancelled }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(recurringBills.id, bill.id))
      .returning();

    return NextResponse.json({ bill: updatedBill });
  },
);
