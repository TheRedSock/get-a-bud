"use server";

import { and, eq, isNotNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  categories,
  financialAccounts,
  households,
  transactions,
} from "@/db/schema";
import { inngest } from "@/inngest/client";
import {
  authenticatedAction,
  validateActionInput,
} from "@/lib/actions/safe-action";
import type { ActionResult } from "@/lib/actions/types";
import { AuditAction, writeAuditEventAsync } from "@/lib/audit";
import { RETRAIN_CORRECTION_THRESHOLD } from "@/lib/classification/types";
import type { AutoLabelMetadata } from "@/lib/classification/relabel";
import { notFoundError, validationError } from "@/lib/errors/catalog";
import { recalculateAccountBalance } from "@/lib/finance/balance";
import {
  detectCategory,
  learnCategoryCorrection,
  normalizeMerchant,
} from "@/lib/finance/categorization";
import {
  getCategoryLearningTarget,
  resolveMerchantIdentity,
  updateMerchantCanonicalName,
  upsertMerchantFromUserCorrection,
} from "@/lib/finance/merchants";
import {
  createTransactionSchema,
  updateTransactionSchema,
} from "@/lib/finance/validation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TransactionMetadata = Record<string, unknown> & {
  parsed?: { counterparty?: string | null };
  autoLabel?: AutoLabelMetadata;
  userEdits?: {
    descriptionEdited?: boolean;
    merchantNameEdited?: boolean;
    originalDescription?: string;
    originalMerchantName?: string | null;
    updatedAt?: string;
  };
};

// ---------------------------------------------------------------------------
// createTransaction
// ---------------------------------------------------------------------------

export const createTransaction = authenticatedAction(
  "transactions.create",
  async (ctx, input: unknown) => {
    const validated = validateActionInput(
      createTransactionSchema,
      input,
      "Please provide a valid transaction account, amount, date and description.",
    );
    if (validated.error) throw validationError(validated.error.message, { fieldErrors: validated.error.fieldErrors });
    const txInput = validated.data;

    // Authorize: account belongs to household
    const [account] = await db
      .select({ id: financialAccounts.id, householdId: financialAccounts.householdId })
      .from(financialAccounts)
      .where(eq(financialAccounts.id, txInput.accountId))
      .limit(1);

    if (!account || account.householdId !== ctx.householdId) {
      throw notFoundError("Choose an account from this household.", {
        accountId: txInput.accountId,
        householdId: ctx.householdId,
      });
    }

    // Authorize: category belongs to household (if provided)
    if (txInput.categoryId) {
      const [cat] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(
          and(
            eq(categories.id, txInput.categoryId),
            eq(categories.householdId, ctx.householdId),
          ),
        )
        .limit(1);

      if (!cat) {
        throw notFoundError("Choose a category from this household.", {
          categoryId: txInput.categoryId,
          householdId: ctx.householdId,
        });
      }
    }

    // Merchant resolution + category detection
    const normalizedMerchant = txInput.merchantName
      ? normalizeMerchant(txInput.merchantName)
      : normalizeMerchant(txInput.description);

    const merchantResolution = txInput.merchantName
      ? await resolveMerchantIdentity({
          householdId: ctx.householdId,
          transaction: {
            description: txInput.description,
            merchantName: txInput.merchantName,
            normalizedMerchantName: normalizedMerchant,
            source: "manual",
          },
        })
      : null;

    const detectionResult =
      txInput.categoryId || merchantResolution?.defaultCategoryId
        ? null
        : await detectCategory(
            ctx.householdId,
            txInput.description,
            txInput.merchantName,
            { normalizedMerchantName: normalizedMerchant },
          );

    const categoryId =
      txInput.categoryId ??
      merchantResolution?.defaultCategoryId ??
      detectionResult?.categoryId ??
      null;
    const categorySource = txInput.categoryId
      ? "user"
      : merchantResolution?.defaultCategoryId
        ? "merchant"
        : detectionResult
          ? "rule"
          : null;
    const categoryConfidence = merchantResolution?.defaultCategoryId
      ? Math.min(merchantResolution.confidence, 0.95).toFixed(2)
      : detectionResult?.confidence?.toFixed(2) ?? null;
    const nextMerchantName =
      merchantResolution && txInput.merchantName
        ? merchantResolution.canonicalName
        : txInput.merchantName;
    const nextDescription =
      merchantResolution && txInput.merchantName
        ? merchantResolution.canonicalName
        : txInput.description;

    // Insert transaction
    const [transaction] = await db
      .insert(transactions)
      .values({
        householdId: ctx.householdId,
        accountId: txInput.accountId,
        merchantId: merchantResolution?.merchantId ?? null,
        categoryId,
        categorySource,
        categoryConfidence,
        amountCents: txInput.amountCents,
        currency: txInput.currency,
        date: txInput.date,
        merchantName: nextMerchantName,
        normalizedMerchantName: normalizeMerchant(nextMerchantName ?? nextDescription),
        description: nextDescription,
        notes: txInput.notes,
        searchText: `${nextDescription} ${nextMerchantName ?? ""}`,
        source: "manual",
      })
      .returning();

    // Learn merchant from user-supplied category + merchant
    if (txInput.categoryId && txInput.merchantName) {
      await upsertMerchantFromUserCorrection({
        householdId: ctx.householdId,
        categoryId: txInput.categoryId,
        transaction: {
          id: transaction.id,
          householdId: ctx.householdId,
          source: "manual",
          description: txInput.description,
          merchantName: txInput.merchantName,
          normalizedMerchantName: normalizedMerchant,
          metadata: transaction.metadata,
        },
        displayMerchantName: txInput.merchantName,
      });
    }

    await recalculateAccountBalance({ accountId: txInput.accountId, householdId: ctx.householdId });

    // Enqueue background categorization if no category was resolved
    if (!categoryId) {
      await inngest.send({
        name: "transactions.categorize",
        data: { householdId: ctx.householdId },
      });
    }

    writeAuditEventAsync({
      householdId: ctx.householdId,
      actorUserId: ctx.user.id,
      action: AuditAction.TRANSACTION_CREATE,
      resourceType: "transaction",
      resourceId: transaction.id,
      outcome: "success",
    });

    return { transaction };
  },
);

// ---------------------------------------------------------------------------
// updateTransaction
// ---------------------------------------------------------------------------

export const updateTransaction = authenticatedAction(
  "transactions.update",
  async (ctx, input: { transactionId: string; data: unknown }) => {
    const validated = validateActionInput(
      updateTransactionSchema,
      input.data,
      "Please provide valid transaction details.",
    );
    if (validated.error) throw validationError(validated.error.message, { fieldErrors: validated.error.fieldErrors });
    const txInput = validated.data;

    // Fetch transaction scoped to household
    const [transaction] = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.id, input.transactionId),
          eq(transactions.householdId, ctx.householdId),
        ),
      )
      .limit(1);

    if (!transaction) {
      throw notFoundError("Transaction not found.", {
        transactionId: input.transactionId,
        householdId: ctx.householdId,
      });
    }

    // Immutability: synced rows cannot have provider-owned fields edited
    const syncedImmutableFields = ["accountId", "amountCents", "currency", "date"] as const;
    const attemptedSyncedEdits = syncedImmutableFields.filter(
      (field) => txInput[field] !== undefined,
    );

    if (transaction.source !== "manual" && attemptedSyncedEdits.length > 0) {
      throw validationError(
        "Bank-synced amount, account, date and currency cannot be edited.",
        {
          fieldErrors: Object.fromEntries(
            attemptedSyncedEdits.map((field) => [
              field,
              ["This value comes from the bank and cannot be edited."],
            ]),
          ),
          context: { transactionId: input.transactionId, source: transaction.source },
        },
      );
    }

    // Authorize: new accountId belongs to household
    if (txInput.accountId) {
      const [account] = await db
        .select({ id: financialAccounts.id })
        .from(financialAccounts)
        .where(
          and(
            eq(financialAccounts.id, txInput.accountId),
            eq(financialAccounts.householdId, ctx.householdId),
          ),
        )
        .limit(1);

      if (!account) {
        throw notFoundError("Choose an account from this household.", {
          accountId: txInput.accountId,
          householdId: ctx.householdId,
        });
      }
    }

    const nextDescription = txInput.description !== undefined
      ? txInput.description
      : transaction.description;
    const nextMerchantName = txInput.merchantName !== undefined
      ? txInput.merchantName
      : transaction.merchantName;
    const metadata = (transaction.metadata ?? {}) as TransactionMetadata;
    const userEdits = { ...(metadata.userEdits ?? {}) };
    const values: Partial<typeof transactions.$inferInsert> = {
      description: nextDescription,
      updatedAt: new Date(),
      searchText: `${nextDescription} ${nextMerchantName ?? ""}`,
      normalizedMerchantName: normalizeMerchant(nextMerchantName ?? nextDescription),
    };

    // Track user edits on synced transactions
    if (
      transaction.source !== "manual" &&
      txInput.description !== undefined &&
      txInput.description !== transaction.description
    ) {
      userEdits.descriptionEdited = true;
      userEdits.originalDescription = userEdits.originalDescription ?? transaction.description;
      userEdits.updatedAt = new Date().toISOString();
      values.metadata = { ...metadata, userEdits };
    }

    // Category change handling
    if (txInput.categoryId !== undefined) {
      if (txInput.categoryId !== null) {
        const [cat] = await db
          .select({ id: categories.id })
          .from(categories)
          .where(
            and(
              eq(categories.id, txInput.categoryId),
              eq(categories.householdId, ctx.householdId),
            ),
          )
          .limit(1);

        if (!cat) {
          throw notFoundError("Choose a category from this household.", {
            categoryId: txInput.categoryId,
            householdId: ctx.householdId,
          });
        }
      }

      values.categoryId = txInput.categoryId;

      if (txInput.categoryId === null) {
        values.categorySource = null;
        values.categoryConfidence = null;
        values.suggestedCategoryId = null;
        values.suggestedDescription = null;
        values.suggestedMerchantName = null;
      } else if (txInput.categoryId !== transaction.categoryId) {
        values.categorySource = "user";
        values.categoryConfidence = "1.00";
        values.suggestedCategoryId = null;
        values.suggestedDescription = null;
        values.suggestedMerchantName = null;
      }
    }

    // Merchant name change handling
    if (txInput.merchantName !== undefined) {
      values.merchantName = txInput.merchantName;

      if (
        transaction.source !== "manual" &&
        txInput.merchantName !== transaction.merchantName
      ) {
        userEdits.merchantNameEdited = true;
        userEdits.originalMerchantName = userEdits.originalMerchantName ?? transaction.merchantName;
        userEdits.updatedAt = new Date().toISOString();
        values.metadata = { ...metadata, userEdits };
      }
    }

    if (txInput.notes !== undefined) values.notes = txInput.notes;
    if (txInput.status !== undefined) values.status = txInput.status;
    if (txInput.excludedFromBudget !== undefined) values.excludedFromBudget = txInput.excludedFromBudget;

    // Manual-only mutable fields
    if (transaction.source === "manual") {
      if (txInput.accountId !== undefined) values.accountId = txInput.accountId;
      if (txInput.amountCents !== undefined) values.amountCents = txInput.amountCents;
      if (txInput.currency !== undefined) values.currency = txInput.currency;
      if (txInput.date !== undefined) values.date = txInput.date;
    }

    const [updatedTransaction] = await db
      .update(transactions)
      .set(values)
      .where(eq(transactions.id, transaction.id))
      .returning();

    // Update merchant canonical name if merchant name changed
    if (
      txInput.merchantName !== undefined &&
      txInput.merchantName !== transaction.merchantName &&
      updatedTransaction.merchantId &&
      txInput.merchantName
    ) {
      await updateMerchantCanonicalName({
        householdId: ctx.householdId,
        merchantId: updatedTransaction.merchantId,
        canonicalName: txInput.merchantName,
      });
    }

    // Learn categorization rule from user's category edit
    if (
      txInput.categoryId !== undefined &&
      txInput.categoryId !== null &&
      txInput.categoryId !== transaction.categoryId
    ) {
      const learningTarget = getCategoryLearningTarget({
        id: transaction.id,
        householdId: transaction.householdId,
        source: transaction.source,
        description: transaction.description,
        merchantName: transaction.merchantName,
        normalizedMerchantName: transaction.normalizedMerchantName,
        transactionType: transaction.transactionType,
        paymentChannel: transaction.paymentChannel,
        metadata: transaction.metadata,
      });

      if (learningTarget) {
        await learnCategoryCorrection({
          householdId: ctx.householdId,
          categoryId: txInput.categoryId,
          matcher: learningTarget.matcher,
          matchField: learningTarget.matchField,
          transactionId: transaction.id,
        });

        await upsertMerchantFromUserCorrection({
          householdId: ctx.householdId,
          categoryId: txInput.categoryId,
          transaction: {
            id: transaction.id,
            householdId: transaction.householdId,
            source: transaction.source,
            description: transaction.description,
            merchantName: transaction.merchantName,
            normalizedMerchantName: transaction.normalizedMerchantName,
            transactionType: transaction.transactionType,
            paymentChannel: transaction.paymentChannel,
            metadata: transaction.metadata,
          },
          displayMerchantName: updatedTransaction.merchantName,
        });

        const [updated] = await db
          .update(households)
          .set({
            classificationCorrectionsSinceTrain: sql`${households.classificationCorrectionsSinceTrain} + 1`,
          })
          .where(eq(households.id, ctx.householdId))
          .returning({ corrections: households.classificationCorrectionsSinceTrain });

        if (updated && updated.corrections >= RETRAIN_CORRECTION_THRESHOLD) {
          await inngest.send({
            name: "model.retrain",
            data: { householdId: ctx.householdId },
          });
        }
      }
    }

    // Recalculate balances when amount or account changes
    const amountChanged = txInput.amountCents !== undefined && txInput.amountCents !== transaction.amountCents;
    const accountChanged = txInput.accountId !== undefined && txInput.accountId !== transaction.accountId;

    if (amountChanged || accountChanged) {
      await recalculateAccountBalance({ accountId: updatedTransaction.accountId, householdId: ctx.householdId });
      if (accountChanged) {
        await recalculateAccountBalance({ accountId: transaction.accountId, householdId: ctx.householdId });
      }
    }

    return { transaction: updatedTransaction };
  },
);

// ---------------------------------------------------------------------------
// approveSuggestion
// ---------------------------------------------------------------------------

export const approveSuggestion = authenticatedAction(
  "transactions.approve-suggestion",
  async (ctx, input: { transactionId: string }) => {
    const [transaction] = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.id, input.transactionId),
          eq(transactions.householdId, ctx.householdId),
        ),
      )
      .limit(1);

    if (!transaction) {
      throw notFoundError("Transaction not found.", {
        transactionId: input.transactionId,
        householdId: ctx.householdId,
      });
    }

    if (!transaction.suggestedCategoryId) {
      throw validationError("No suggestion to approve.");
    }

    // Validate suggested category still exists in household
    const [cat] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.id, transaction.suggestedCategoryId),
          eq(categories.householdId, ctx.householdId),
        ),
      )
      .limit(1);

    if (!cat) {
      throw validationError(
        "The suggested category is no longer available. Please choose a category manually.",
      );
    }

    const nextDescription = transaction.suggestedDescription ?? transaction.description;
    const nextMerchantName = transaction.suggestedMerchantName ?? transaction.merchantName;

    const [updated] = await db
      .update(transactions)
      .set({
        categoryId: transaction.suggestedCategoryId,
        description: nextDescription,
        merchantName: nextMerchantName,
        normalizedMerchantName: normalizeMerchant(nextMerchantName ?? nextDescription),
        searchText: `${nextDescription} ${nextMerchantName ?? ""}`,
        categorySource: "user",
        categoryConfidence: "1.00",
        suggestedCategoryId: null,
        suggestedDescription: null,
        suggestedMerchantName: null,
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, input.transactionId))
      .returning();

    // Learn from approval
    const learningTarget = getCategoryLearningTarget({
      id: transaction.id,
      householdId: transaction.householdId,
      source: transaction.source,
      description: transaction.description,
      merchantName: transaction.merchantName,
      normalizedMerchantName: transaction.normalizedMerchantName,
      transactionType: transaction.transactionType,
      paymentChannel: transaction.paymentChannel,
      metadata: transaction.metadata,
    });

    if (learningTarget) {
      await learnCategoryCorrection({
        householdId: ctx.householdId,
        categoryId: transaction.suggestedCategoryId,
        matcher: learningTarget.matcher,
        matchField: learningTarget.matchField,
        transactionId: input.transactionId,
      });

      await upsertMerchantFromUserCorrection({
        householdId: ctx.householdId,
        categoryId: transaction.suggestedCategoryId,
        transaction: {
          id: transaction.id,
          householdId: transaction.householdId,
          source: transaction.source,
          description: transaction.description,
          merchantName: transaction.merchantName,
          normalizedMerchantName: transaction.normalizedMerchantName,
          transactionType: transaction.transactionType,
          paymentChannel: transaction.paymentChannel,
          metadata: transaction.metadata,
        },
        displayMerchantName: nextMerchantName,
      });

      const [hh] = await db
        .update(households)
        .set({
          classificationCorrectionsSinceTrain: sql`${households.classificationCorrectionsSinceTrain} + 1`,
        })
        .where(eq(households.id, ctx.householdId))
        .returning({ corrections: households.classificationCorrectionsSinceTrain });

      if (hh && hh.corrections >= RETRAIN_CORRECTION_THRESHOLD) {
        await inngest.send({
          name: "model.retrain",
          data: { householdId: ctx.householdId },
        });
      }
    }

    return { transaction: updated };
  },
);

// ---------------------------------------------------------------------------
// rejectSuggestion
// ---------------------------------------------------------------------------

export const rejectSuggestion = authenticatedAction(
  "transactions.reject-suggestion",
  async (ctx, input: { transactionId: string }) => {
    const [transaction] = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.id, input.transactionId),
          eq(transactions.householdId, ctx.householdId),
        ),
      )
      .limit(1);

    if (!transaction) {
      throw notFoundError("Transaction not found.", {
        transactionId: input.transactionId,
        householdId: ctx.householdId,
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
      .where(eq(transactions.id, input.transactionId))
      .returning();

    return { transaction: updated };
  },
);

// ---------------------------------------------------------------------------
// undoAutoLabel
// ---------------------------------------------------------------------------

export const undoAutoLabel = authenticatedAction(
  "transactions.undo-auto-label",
  async (ctx, input: { transactionId: string }) => {
    const [transaction] = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.id, input.transactionId),
          eq(transactions.householdId, ctx.householdId),
        ),
      )
      .limit(1);

    if (!transaction) {
      throw notFoundError("Transaction not found.", {
        transactionId: input.transactionId,
        householdId: ctx.householdId,
      });
    }

    const metadata = (transaction.metadata ?? {}) as TransactionMetadata;
    const autoLabel = metadata.autoLabel;

    if (!autoLabel || autoLabel.undone) {
      throw validationError("No auto-label to undo.");
    }

    const restoredDescription = autoLabel.originalDescription;
    const restoredMerchantName = autoLabel.originalMerchantName;

    const [updated] = await db
      .update(transactions)
      .set({
        description: restoredDescription,
        merchantName: restoredMerchantName,
        normalizedMerchantName: normalizeMerchant(restoredMerchantName ?? restoredDescription),
        searchText: `${restoredDescription} ${restoredMerchantName ?? ""}`,
        categoryId: null,
        categorySource: null,
        categoryConfidence: null,
        suggestedCategoryId: null,
        suggestedDescription: null,
        suggestedMerchantName: null,
        metadata: { ...metadata, autoLabel: { ...autoLabel, undone: true } },
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, input.transactionId))
      .returning();

    // Undo counts as a negative signal for retraining
    const [hh] = await db
      .update(households)
      .set({
        classificationCorrectionsSinceTrain: sql`${households.classificationCorrectionsSinceTrain} + 1`,
      })
      .where(eq(households.id, ctx.householdId))
      .returning({ corrections: households.classificationCorrectionsSinceTrain });

    if (hh && hh.corrections >= RETRAIN_CORRECTION_THRESHOLD) {
      await inngest.send({
        name: "model.retrain",
        data: { householdId: ctx.householdId },
      });
    }

    return { transaction: updated };
  },
);

// ---------------------------------------------------------------------------
// approveAllSuggestions
// ---------------------------------------------------------------------------

export const approveAllSuggestions = authenticatedAction(
  "transactions.approve-all-suggestions",
  async (ctx, _input: void) => {
    // Load all transactions with pending suggestions
    const pending = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.householdId, ctx.householdId),
          isNotNull(transactions.suggestedCategoryId),
        ),
      );

    if (pending.length === 0) {
      return { approved: 0 };
    }

    // Validate suggested categories exist in household
    const validCats = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.householdId, ctx.householdId));

    const validCatIds = new Set(validCats.map((c) => c.id));

    let approved = 0;
    let corrections = 0;

    for (const transaction of pending) {
      if (
        !transaction.suggestedCategoryId ||
        !validCatIds.has(transaction.suggestedCategoryId)
      ) {
        continue;
      }

      const nextDescription = transaction.suggestedDescription ?? transaction.description;
      const nextMerchantName = transaction.suggestedMerchantName ?? transaction.merchantName;

      await db
        .update(transactions)
        .set({
          categoryId: transaction.suggestedCategoryId,
          description: nextDescription,
          merchantName: nextMerchantName,
          normalizedMerchantName: normalizeMerchant(nextMerchantName ?? nextDescription),
          searchText: `${nextDescription} ${nextMerchantName ?? ""}`,
          categorySource: "user",
          categoryConfidence: "1.00",
          suggestedCategoryId: null,
          suggestedDescription: null,
          suggestedMerchantName: null,
          updatedAt: new Date(),
        })
        .where(eq(transactions.id, transaction.id));

      approved += 1;

      // Learn from each approval
      const learningTarget = getCategoryLearningTarget({
        id: transaction.id,
        householdId: transaction.householdId,
        source: transaction.source,
        description: transaction.description,
        merchantName: transaction.merchantName,
        normalizedMerchantName: transaction.normalizedMerchantName,
        transactionType: transaction.transactionType,
        paymentChannel: transaction.paymentChannel,
        metadata: transaction.metadata,
      });

      if (learningTarget) {
        await learnCategoryCorrection({
          householdId: ctx.householdId,
          categoryId: transaction.suggestedCategoryId,
          matcher: learningTarget.matcher,
          matchField: learningTarget.matchField,
          transactionId: transaction.id,
        });
        await upsertMerchantFromUserCorrection({
          householdId: ctx.householdId,
          categoryId: transaction.suggestedCategoryId,
          transaction: {
            id: transaction.id,
            householdId: transaction.householdId,
            source: transaction.source,
            description: transaction.description,
            merchantName: transaction.merchantName,
            normalizedMerchantName: transaction.normalizedMerchantName,
            transactionType: transaction.transactionType,
            paymentChannel: transaction.paymentChannel,
            metadata: transaction.metadata,
          },
          displayMerchantName: nextMerchantName,
        });
        corrections += 1;
      }
    }

    // Batch correction counter increment
    if (corrections > 0) {
      const [hh] = await db
        .update(households)
        .set({
          classificationCorrectionsSinceTrain: sql`${households.classificationCorrectionsSinceTrain} + ${corrections}`,
        })
        .where(eq(households.id, ctx.householdId))
        .returning({ correctionCount: households.classificationCorrectionsSinceTrain });

      if (hh && hh.correctionCount >= RETRAIN_CORRECTION_THRESHOLD) {
        await inngest.send({
          name: "model.retrain",
          data: { householdId: ctx.householdId },
        });
      }
    }

    return { approved };
  },
);

// ---------------------------------------------------------------------------
// classifyTransactions
// ---------------------------------------------------------------------------

export const classifyTransactions = authenticatedAction(
  "transactions.classify",
  async (ctx, _input: void) => {
    await inngest.send({
      name: "transactions.categorize",
      data: { householdId: ctx.householdId },
    });

    return { queued: true };
  },
);
