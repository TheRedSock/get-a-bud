import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { recurringBillHistory, recurringBills, transactions } from "@/db/schema";
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

type TransactionMetadata = Record<string, unknown> & {
  recurringDetection?: {
    ignored?: boolean;
    rejectedAt?: string;
    rejectedBillIds?: string[];
    merchantPattern?: string;
    amountSignature?: string;
  };
};

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

export const DELETE = withApiHandler(
  "bills.reject",
  async (
    _request: Request,
    { params }: { params: Promise<{ billId: string }> },
  ) => {
    const { billId } = await params;
    const household = await getActiveHousehold();

    const result = await db.transaction(async (tx) => {
      const [bill] = await tx
        .select({
          id: recurringBills.id,
          merchantPattern: recurringBills.merchantPattern,
          amountSignature: recurringBills.amountSignature,
        })
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

      const historyRows = await tx
        .select({ transactionId: recurringBillHistory.transactionId })
        .from(recurringBillHistory)
        .where(eq(recurringBillHistory.billId, bill.id));
      const transactionIds = historyRows
        .map((row) => row.transactionId)
        .filter((id): id is string => Boolean(id));

      if (transactionIds.length > 0) {
        const matchedTransactions = await tx
          .select({
            id: transactions.id,
            metadata: transactions.metadata,
          })
          .from(transactions)
          .where(
            and(
              eq(transactions.householdId, household.householdId),
              inArray(transactions.id, transactionIds),
            ),
          );

        const rejectedAt = new Date().toISOString();

        for (const transaction of matchedTransactions) {
          const metadata = (transaction.metadata ?? {}) as TransactionMetadata;
          const rejectedBillIds = new Set(
            metadata.recurringDetection?.rejectedBillIds ?? [],
          );
          rejectedBillIds.add(bill.id);

          await tx
            .update(transactions)
            .set({
              metadata: {
                ...metadata,
                recurringDetection: {
                  ...metadata.recurringDetection,
                  ignored: true,
                  rejectedAt,
                  rejectedBillIds: Array.from(rejectedBillIds),
                  merchantPattern: bill.merchantPattern,
                  amountSignature: bill.amountSignature,
                },
              },
              updatedAt: new Date(),
            })
            .where(eq(transactions.id, transaction.id));
        }
      }

      await tx.delete(recurringBills).where(eq(recurringBills.id, bill.id));

      return { ignoredTransactions: transactionIds.length };
    });

    return NextResponse.json({ rejected: true, ...result });
  },
);
