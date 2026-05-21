"use server";

import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  categories,
  financialAccounts,
  recurringBillHistory,
  recurringBills,
  transactions,
} from "@/db/schema";
import { EVENT_NAMES } from "@/inngest/lib/events";
import { sendInngestEvent } from "@/inngest/lib/send-event";
import {
  authenticatedAction,
  validateActionInput,
} from "@/lib/actions/safe-action";
import { AuditAction, writeAuditEventAsync } from "@/lib/audit";
import { notFoundError, validationError } from "@/lib/errors/catalog";
import { moneyPreprocessor } from "@/lib/finance/money";
import {
  authenticatedMutationRateLimit,
  enforceActionRateLimit,
  queueEnqueueRateLimit,
} from "@/lib/security/arcjet";

// ---------------------------------------------------------------------------
// Envelope schemas
// ---------------------------------------------------------------------------

const billIdEnvelope = z.object({
  billId: z.string().min(1),
});

const billUpdateEnvelope = z.object({
  billId: z.string().min(1),
  data: z.unknown(),
});

const billCategoryEnvelope = z.object({
  billId: z.string().min(1),
  data: z.unknown(),
});

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
  expectedAmountCents: z.preprocess(moneyPreprocessor, z.number().int().optional()),
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
  expectedAmountCents: z.preprocess(
    moneyPreprocessor,
    z.number().int().nonnegative().nullable().optional(),
  ),
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
    await enforceActionRateLimit(authenticatedMutationRateLimit, ctx.user.id);

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
        expectedAmountCents: billInput.expectedAmountCents ?? null,
        nextDueDate: billInput.nextDueDate,
      })
      .returning();

    writeAuditEventAsync({
      householdId: ctx.householdId,
      actorUserId: ctx.user.id,
      action: AuditAction.BILL_CREATE,
      resourceType: "recurring_bill",
      resourceId: bill.id,
      outcome: "success",
    });

    return { bill };
  },
);

// ---------------------------------------------------------------------------
// updateBill
// ---------------------------------------------------------------------------

export const updateBill = authenticatedAction(
  "bills.update",
  async (ctx, input: unknown) => {
    await enforceActionRateLimit(authenticatedMutationRateLimit, ctx.user.id);

    const envelope = validateActionInput(
      billUpdateEnvelope,
      input,
      "Please provide a valid bill ID.",
    );
    if (envelope.error) throw validationError(envelope.error.message, { fieldErrors: envelope.error.fieldErrors });
    const { billId, data } = envelope.data;

    const validated = validateActionInput(
      billUpdateSchema,
      data,
      "Please provide valid bill details.",
    );
    if (validated.error) throw validationError(validated.error.message, { fieldErrors: validated.error.fieldErrors });
    const billInput = validated.data;

    const [bill] = await db
      .select({ id: recurringBills.id })
      .from(recurringBills)
      .where(
        and(
          eq(recurringBills.id, billId),
          eq(recurringBills.householdId, ctx.householdId),
        ),
      )
      .limit(1);

    if (!bill) {
      throw notFoundError("Recurring bill not found.", {
        billId,
        householdId: ctx.householdId,
      });
    }

    const [updatedBill] = await db
      .update(recurringBills)
      .set({
        ...(billInput.name !== undefined ? { name: billInput.name } : {}),
        ...(billInput.cadence !== undefined ? { cadence: billInput.cadence } : {}),
        ...(billInput.expectedAmountCents !== undefined
          ? {
              expectedAmountCents:
                billInput.expectedAmountCents ?? null,
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
      .where(
        and(
          eq(recurringBills.id, billId),
          eq(recurringBills.householdId, ctx.householdId),
        ),
      )
      .returning();

    writeAuditEventAsync({
      householdId: ctx.householdId,
      actorUserId: ctx.user.id,
      action: AuditAction.BILL_UPDATE,
      resourceType: "recurring_bill",
      resourceId: billId,
      outcome: "success",
    });

    return { bill: updatedBill };
  },
);

// ---------------------------------------------------------------------------
// rejectBill (DELETE equivalent)
// ---------------------------------------------------------------------------

export const rejectBill = authenticatedAction(
  "bills.reject",
  async (ctx, input: unknown) => {
    await enforceActionRateLimit(authenticatedMutationRateLimit, ctx.user.id);

    const envelope = validateActionInput(
      billIdEnvelope,
      input,
      "Please provide a valid bill ID.",
    );
    if (envelope.error) throw validationError(envelope.error.message, { fieldErrors: envelope.error.fieldErrors });
    const { billId } = envelope.data;

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
            eq(recurringBills.householdId, ctx.householdId),
          ),
        )
        .limit(1);

      if (!bill) {
        throw notFoundError("Recurring bill not found.", {
          billId,
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
            .where(
              and(
                eq(transactions.id, transaction.id),
                eq(transactions.householdId, ctx.householdId),
              ),
            );
        }
      }

      await tx.delete(recurringBills).where(
        and(
          eq(recurringBills.id, bill.id),
          eq(recurringBills.householdId, ctx.householdId),
        ),
      );

      return { ignoredTransactions: transactionIds.length };
    });

    writeAuditEventAsync({
      householdId: ctx.householdId,
      actorUserId: ctx.user.id,
      action: AuditAction.BILL_REJECT,
      resourceType: "recurring_bill",
      resourceId: billId,
      outcome: "success",
    });

    return { rejected: true, ...result };
  },
);

// ---------------------------------------------------------------------------
// updateBillCategory
// ---------------------------------------------------------------------------

export const updateBillCategory = authenticatedAction(
  "bills.update-category",
  async (ctx, input: unknown) => {
    await enforceActionRateLimit(authenticatedMutationRateLimit, ctx.user.id);

    const envelope = validateActionInput(
      billCategoryEnvelope,
      input,
      "Please provide a valid bill ID.",
    );
    if (envelope.error) throw validationError(envelope.error.message, { fieldErrors: envelope.error.fieldErrors });
    const { billId, data } = envelope.data;

    const validated = validateActionInput(
      billCategorySchema,
      data,
      "Please choose a valid bill category.",
    );
    if (validated.error) throw validationError(validated.error.message, { fieldErrors: validated.error.fieldErrors });
    const categoryInput = validated.data;

    const [bill] = await db
      .select()
      .from(recurringBills)
      .where(
        and(
          eq(recurringBills.id, billId),
          eq(recurringBills.householdId, ctx.householdId),
        ),
      )
      .limit(1);

    if (!bill) {
      throw notFoundError("Recurring bill not found.", {
        billId,
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
      .where(
        and(
          eq(recurringBills.id, billId),
          eq(recurringBills.householdId, ctx.householdId),
        ),
      )
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
        .where(
          and(
            eq(recurringBillHistory.billId, bill.id),
            eq(transactions.householdId, ctx.householdId),
          ),
        );

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
          .where(
            and(
              inArray(transactions.id, applicableIds),
              eq(transactions.householdId, ctx.householdId),
            ),
          )
          .returning({ id: transactions.id });
        applied = updatedRows.length;
      }
    }

    if (applied > 0) {
      await sendInngestEvent(EVENT_NAMES.retrainModel, {
        householdId: ctx.householdId,
      });
    }

    writeAuditEventAsync({
      householdId: ctx.householdId,
      actorUserId: ctx.user.id,
      action: AuditAction.BILL_UPDATE,
      resourceType: "recurring_bill",
      resourceId: billId,
      outcome: "success",
      metadata: { operation: "update_category", applied },
    });

    return { bill: updatedBill, applied };
  },
);

// ---------------------------------------------------------------------------
// detectRecurringBills
// ---------------------------------------------------------------------------

export const detectRecurringBills = authenticatedAction(
  "bills.detect-recurring",
  async (ctx, _input: void) => {
    await enforceActionRateLimit(queueEnqueueRateLimit, ctx.user.id);

    await sendInngestEvent(EVENT_NAMES.detectRecurringBills, {
      householdId: ctx.householdId,
    });

    return { queued: true };
  },
);

// ---------------------------------------------------------------------------
// getBillTransactions
// ---------------------------------------------------------------------------

export const getBillTransactions = authenticatedAction(
  "bills.transactions",
  async (ctx, input: unknown) => {
    const envelope = validateActionInput(
      billIdEnvelope,
      input,
      "Please provide a valid bill ID.",
    );
    if (envelope.error)
      throw validationError(envelope.error.message, {
        fieldErrors: envelope.error.fieldErrors,
      });
    const { billId } = envelope.data;

    const [bill] = await db
      .select({
        id: recurringBills.id,
        cadence: recurringBills.cadence,
        pattern: recurringBills.pattern,
        typicalDayOfMonth: recurringBills.typicalDayOfMonth,
        merchantPattern: recurringBills.merchantPattern,
        amountSignature: recurringBills.amountSignature,
      })
      .from(recurringBills)
      .where(
        and(
          eq(recurringBills.id, billId),
          eq(recurringBills.householdId, ctx.householdId),
        ),
      )
      .limit(1);

    if (!bill) {
      throw notFoundError("Recurring bill not found.", {
        billId,
        householdId: ctx.householdId,
      });
    }

    const rows = await db
      .select({
        historyId: recurringBillHistory.id,
        amountCents: recurringBillHistory.amountCents,
        originalAmountCents: recurringBillHistory.originalAmountCents,
        originalCurrency: recurringBillHistory.originalCurrency,
        date: recurringBillHistory.date,
        transactionId: recurringBillHistory.transactionId,
        description: transactions.description,
        merchantName: transactions.merchantName,
        normalizedMerchantName: transactions.normalizedMerchantName,
        currency: transactions.currency,
        transactionAmountCents: transactions.amountCents,
        excludedFromBudget: transactions.excludedFromBudget,
        transactionType: transactions.transactionType,
        accountName: financialAccounts.name,
      })
      .from(recurringBillHistory)
      .leftJoin(
        transactions,
        eq(transactions.id, recurringBillHistory.transactionId),
      )
      .leftJoin(
        financialAccounts,
        eq(financialAccounts.id, transactions.accountId),
      )
      .where(eq(recurringBillHistory.billId, bill.id))
      .orderBy(desc(recurringBillHistory.date));

    return {
      pattern: {
        cadence: bill.cadence,
        pattern: bill.pattern,
        typicalDayOfMonth: bill.typicalDayOfMonth,
        merchantPattern: bill.merchantPattern,
        amountSignature: bill.amountSignature,
      },
      transactions: rows,
    };
  },
);
