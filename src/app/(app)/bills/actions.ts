"use server";

import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  categories,
  recurringBillHistory,
  recurringBills,
  transactions,
} from "@/db/schema";
import { inngest } from "@/inngest/client";
import {
  authenticatedAction,
  validateActionInput,
} from "@/lib/actions/safe-action";
import { notFoundError, validationError } from "@/lib/errors/catalog";
import { parseMoneyToCents } from "@/lib/finance/money";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const billCreateSchema = z.object({
  name: z.string().min(1).max(120),
  merchantPattern: z.string().min(1).max(160),
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
    .default("monthly"),
  expectedAmount: z.coerce.number().optional(),
  nextDueDate: z.string().min(8).optional(),
});

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

const billCategorySchema = z.object({
  categoryId: z.string().min(1).nullable(),
  applyToTransactions: z.coerce.boolean().default(true),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TransactionMetadata = Record<string, unknown> & {
  recurringDetection?: {
    ignored?: boolean;
    rejectedAt?: string;
    rejectedBillIds?: string[];
    merchantPattern?: string;
    amountSignature?: string;
  };
};

// ---------------------------------------------------------------------------
// createBill
// ---------------------------------------------------------------------------

export const createBill = authenticatedAction(
  "bills.create",
  async (ctx, input: unknown) => {
    const validated = validateActionInput(
      billCreateSchema,
      input,
      "Please provide a valid bill name, merchant pattern and cadence.",
    );
    if (validated.error) throw validationError(validated.error.message, { fieldErrors: validated.error.fieldErrors });
    const billInput = validated.data;

    const [bill] = await db
      .insert(recurringBills)
      .values({
        householdId: ctx.householdId,
        name: billInput.name,
        merchantPattern: billInput.merchantPattern,
        cadence: billInput.cadence,
        expectedAmountCents: billInput.expectedAmount
          ? parseMoneyToCents(billInput.expectedAmount)
          : null,
        nextDueDate: billInput.nextDueDate,
      })
      .returning();

    return { bill };
  },
);

// ---------------------------------------------------------------------------
// updateBill
// ---------------------------------------------------------------------------

export const updateBill = authenticatedAction(
  "bills.update",
  async (ctx, input: { billId: string; data: unknown }) => {
    const validated = validateActionInput(
      billUpdateSchema,
      input.data,
      "Please provide valid bill details.",
    );
    if (validated.error) throw validationError(validated.error.message, { fieldErrors: validated.error.fieldErrors });
    const billInput = validated.data;

    const [bill] = await db
      .select({ id: recurringBills.id })
      .from(recurringBills)
      .where(
        and(
          eq(recurringBills.id, input.billId),
          eq(recurringBills.householdId, ctx.householdId),
        ),
      )
      .limit(1);

    if (!bill) {
      throw notFoundError("Recurring bill not found.", {
        billId: input.billId,
        householdId: ctx.householdId,
      });
    }

    const [updatedBill] = await db
      .update(recurringBills)
      .set({
        ...(billInput.name !== undefined ? { name: billInput.name } : {}),
        ...(billInput.cadence !== undefined ? { cadence: billInput.cadence } : {}),
        ...(billInput.expectedAmount !== undefined
          ? {
              expectedAmount:
                billInput.expectedAmount == null
                  ? null
                  : billInput.expectedAmount.toFixed(2),
            }
          : {}),
        ...(billInput.nextDueDate !== undefined
          ? { nextDueDate: billInput.nextDueDate }
          : {}),
        ...(billInput.isActive !== undefined ? { isActive: billInput.isActive } : {}),
        ...(billInput.isPossiblyCancelled !== undefined
          ? { isPossiblyCancelled: billInput.isPossiblyCancelled }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(recurringBills.id, bill.id))
      .returning();

    return { bill: updatedBill };
  },
);

// ---------------------------------------------------------------------------
// rejectBill (DELETE equivalent)
// ---------------------------------------------------------------------------

export const rejectBill = authenticatedAction(
  "bills.reject",
  async (ctx, input: { billId: string }) => {
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
            eq(recurringBills.id, input.billId),
            eq(recurringBills.householdId, ctx.householdId),
          ),
        )
        .limit(1);

      if (!bill) {
        throw notFoundError("Recurring bill not found.", {
          billId: input.billId,
          householdId: ctx.householdId,
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
          .select({ id: transactions.id, metadata: transactions.metadata })
          .from(transactions)
          .where(
            and(
              eq(transactions.householdId, ctx.householdId),
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

    return { rejected: true, ...result };
  },
);

// ---------------------------------------------------------------------------
// updateBillCategory
// ---------------------------------------------------------------------------

export const updateBillCategory = authenticatedAction(
  "bills.update-category",
  async (ctx, input: { billId: string; data: unknown }) => {
    const validated = validateActionInput(
      billCategorySchema,
      input.data,
      "Please choose a valid bill category.",
    );
    if (validated.error) throw validationError(validated.error.message, { fieldErrors: validated.error.fieldErrors });
    const categoryInput = validated.data;

    const [bill] = await db
      .select()
      .from(recurringBills)
      .where(
        and(
          eq(recurringBills.id, input.billId),
          eq(recurringBills.householdId, ctx.householdId),
        ),
      )
      .limit(1);

    if (!bill) {
      throw notFoundError("Recurring bill not found.", {
        billId: input.billId,
        householdId: ctx.householdId,
      });
    }

    // Validate category belongs to household
    if (categoryInput.categoryId) {
      const [category] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(
          and(
            eq(categories.id, categoryInput.categoryId),
            eq(categories.householdId, ctx.householdId),
          ),
        )
        .limit(1);

      if (!category) {
        throw notFoundError("Choose a category from this household.", {
          categoryId: categoryInput.categoryId,
          householdId: ctx.householdId,
        });
      }
    }

    const [updatedBill] = await db
      .update(recurringBills)
      .set({ categoryId: categoryInput.categoryId, updatedAt: new Date() })
      .where(eq(recurringBills.id, bill.id))
      .returning();

    let applied = 0;

    if (categoryInput.applyToTransactions && categoryInput.categoryId) {
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
            categoryId: categoryInput.categoryId,
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
        data: { householdId: ctx.householdId },
      });
    }

    return { bill: updatedBill, applied };
  },
);

// ---------------------------------------------------------------------------
// detectRecurringBills
// ---------------------------------------------------------------------------

export const detectRecurringBills = authenticatedAction(
  "bills.detect-recurring",
  async (ctx, _input: void) => {
    await inngest.send({
      name: "transactions.recurring.detect",
      data: { householdId: ctx.householdId },
    });

    return { queued: true };
  },
);
