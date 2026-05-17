"use server";

import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  categories,
  financialAccounts,
  transactions,
} from "@/db/schema";
import { inngest } from "@/inngest/client";
import {
  authenticatedAction,
  validateActionInput,
} from "@/lib/actions/safe-action";
import { AuditAction, writeAuditEvent, writeAuditEventAsync } from "@/lib/audit";
import { notFoundError, validationError } from "@/lib/errors/catalog";
import { recalculateAccountBalance } from "@/lib/finance/balance";
import {
  detectCategory,
  normalizeMerchant,
} from "@/lib/finance/categorization";
import {
  resolveMerchantIdentity,
  updateMerchantCanonicalName,
  upsertMerchantFromUserCorrection,
} from "@/lib/finance/merchants";
import {
  buildSuggestionApprovalValues,
  buildUndoAutoLabelValues,
  incrementCorrectionsAndRetrain,
  learnFromCategoryCorrection,
} from "@/lib/finance/transactions";
import {
  authenticatedMutationRateLimit,
  bulkOperationRateLimit,
  enforceActionRateLimit,
  queueEnqueueRateLimit,
} from "@/lib/security/arcjet";
import {
  createTransactionSchema,
  updateTransactionSchema,
} from "@/lib/finance/validation";

// ---------------------------------------------------------------------------
// Envelope schemas — validate IDs at the boundary
// ---------------------------------------------------------------------------

const updateTransactionEnvelope = z.object({
  transactionId: z.string().min(1),
  data: z.unknown(),
});

const transactionIdEnvelope = z.object({
  transactionId: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Types (action-local metadata shape for user edit tracking)
// ---------------------------------------------------------------------------

type TransactionMetadata = Record<string, unknown> & {
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
    await enforceActionRateLimit(authenticatedMutationRateLimit, ctx.user.id);

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

    await writeAuditEvent({
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
  async (ctx, input: unknown) => {
    await enforceActionRateLimit(authenticatedMutationRateLimit, ctx.user.id);

    const envelope = validateActionInput(
      updateTransactionEnvelope,
      input,
      "Please provide a valid transaction ID.",
    );
    if (envelope.error) throw validationError(envelope.error.message, { fieldErrors: envelope.error.fieldErrors });
    const { transactionId, data } = envelope.data;

    const validated = validateActionInput(
      updateTransactionSchema,
      data,
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
          eq(transactions.id, transactionId),
          eq(transactions.householdId, ctx.householdId),
        ),
      )
      .limit(1);

    if (!transaction) {
      throw notFoundError("Transaction not found.", {
        transactionId,
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
          context: { transactionId, source: transaction.source },
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
      .where(
        and(
          eq(transactions.id, transaction.id),
          eq(transactions.householdId, ctx.householdId),
        ),
      )
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
      await learnFromCategoryCorrection({
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

    await writeAuditEvent({
      householdId: ctx.householdId,
      actorUserId: ctx.user.id,
      action: AuditAction.TRANSACTION_UPDATE,
      resourceType: "transaction",
      resourceId: transactionId,
      outcome: "success",
    });

    return { transaction: updatedTransaction };
  },
);

// ---------------------------------------------------------------------------
// approveSuggestion
// ---------------------------------------------------------------------------

export const approveSuggestion = authenticatedAction(
  "transactions.approve-suggestion",
  async (ctx, input: unknown) => {
    await enforceActionRateLimit(authenticatedMutationRateLimit, ctx.user.id);

    const envelope = validateActionInput(
      transactionIdEnvelope,
      input,
      "Please provide a valid transaction ID.",
    );
    if (envelope.error) throw validationError(envelope.error.message, { fieldErrors: envelope.error.fieldErrors });
    const { transactionId } = envelope.data;

    const [transaction] = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.id, transactionId),
          eq(transactions.householdId, ctx.householdId),
        ),
      )
      .limit(1);

    if (!transaction) {
      throw notFoundError("Transaction not found.", {
        transactionId,
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

    const approvalValues = buildSuggestionApprovalValues({
      suggestedDescription: transaction.suggestedDescription,
      suggestedMerchantName: transaction.suggestedMerchantName,
      suggestedCategoryId: transaction.suggestedCategoryId,
      description: transaction.description,
      merchantName: transaction.merchantName,
    });

    const [updated] = await db
      .update(transactions)
      .set(approvalValues)
      .where(
        and(
          eq(transactions.id, transactionId),
          eq(transactions.householdId, ctx.householdId),
        ),
      )
      .returning();

    // Learn from approval
    await learnFromCategoryCorrection({
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
      displayMerchantName: approvalValues.merchantName,
    });

    writeAuditEventAsync({
      householdId: ctx.householdId,
      actorUserId: ctx.user.id,
      action: AuditAction.TRANSACTION_ENRICH,
      resourceType: "transaction",
      resourceId: transactionId,
      outcome: "success",
      metadata: { operation: "approve_suggestion" },
    });

    return { transaction: updated };
  },
);

// ---------------------------------------------------------------------------
// rejectSuggestion
// ---------------------------------------------------------------------------

export const rejectSuggestion = authenticatedAction(
  "transactions.reject-suggestion",
  async (ctx, input: unknown) => {
    await enforceActionRateLimit(authenticatedMutationRateLimit, ctx.user.id);

    const envelope = validateActionInput(
      transactionIdEnvelope,
      input,
      "Please provide a valid transaction ID.",
    );
    if (envelope.error) throw validationError(envelope.error.message, { fieldErrors: envelope.error.fieldErrors });
    const { transactionId } = envelope.data;

    const [transaction] = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.id, transactionId),
          eq(transactions.householdId, ctx.householdId),
        ),
      )
      .limit(1);

    if (!transaction) {
      throw notFoundError("Transaction not found.", {
        transactionId,
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
      .where(
        and(
          eq(transactions.id, transactionId),
          eq(transactions.householdId, ctx.householdId),
        ),
      )
      .returning();

    return { transaction: updated };
  },
);

// ---------------------------------------------------------------------------
// undoAutoLabel
// ---------------------------------------------------------------------------

export const undoAutoLabel = authenticatedAction(
  "transactions.undo-auto-label",
  async (ctx, input: unknown) => {
    await enforceActionRateLimit(authenticatedMutationRateLimit, ctx.user.id);

    const envelope = validateActionInput(
      transactionIdEnvelope,
      input,
      "Please provide a valid transaction ID.",
    );
    if (envelope.error) throw validationError(envelope.error.message, { fieldErrors: envelope.error.fieldErrors });
    const { transactionId } = envelope.data;

    const [transaction] = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.id, transactionId),
          eq(transactions.householdId, ctx.householdId),
        ),
      )
      .limit(1);

    if (!transaction) {
      throw notFoundError("Transaction not found.", {
        transactionId,
        householdId: ctx.householdId,
      });
    }

    const undoResult = buildUndoAutoLabelValues(transaction.metadata);
    if (!undoResult) {
      throw validationError("No auto-label to undo.");
    }

    const [updated] = await db
      .update(transactions)
      .set(undoResult.values)
      .where(
        and(
          eq(transactions.id, transactionId),
          eq(transactions.householdId, ctx.householdId),
        ),
      )
      .returning();

    // Undo counts as a negative signal for retraining
    await incrementCorrectionsAndRetrain(ctx.householdId, 1);

    return { transaction: updated };
  },
);

// ---------------------------------------------------------------------------
// approveAllSuggestions
// ---------------------------------------------------------------------------

const BULK_APPROVE_BATCH_SIZE = 100;

export const approveAllSuggestions = authenticatedAction(
  "transactions.approve-all-suggestions",
  async (ctx, _input: void) => {
    await enforceActionRateLimit(bulkOperationRateLimit, ctx.user.id);

    // Fetch a bounded batch of transactions with pending suggestions
    const pending = await db
      .select({
        id: transactions.id,
        householdId: transactions.householdId,
        source: transactions.source,
        description: transactions.description,
        merchantName: transactions.merchantName,
        normalizedMerchantName: transactions.normalizedMerchantName,
        transactionType: transactions.transactionType,
        paymentChannel: transactions.paymentChannel,
        metadata: transactions.metadata,
        suggestedCategoryId: transactions.suggestedCategoryId,
        suggestedDescription: transactions.suggestedDescription,
        suggestedMerchantName: transactions.suggestedMerchantName,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.householdId, ctx.householdId),
          isNotNull(transactions.suggestedCategoryId),
        ),
      )
      .limit(BULK_APPROVE_BATCH_SIZE);

    if (pending.length === 0) {
      return { approved: 0, remaining: 0 };
    }

    // Validate suggested categories exist in household
    const validCats = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.householdId, ctx.householdId));

    const validCatIds = new Set(validCats.map((c) => c.id));

    // Separate valid from invalid suggestions
    const validPending = pending.filter(
      (tx) => tx.suggestedCategoryId && validCatIds.has(tx.suggestedCategoryId),
    );

    if (validPending.length === 0) {
      return { approved: 0, remaining: 0 };
    }

    // Batch update: apply approval values to all valid transactions at once.
    // Group by suggested category to batch updates with the same set values.
    const updateGroups = new Map<string, typeof validPending>();
    for (const tx of validPending) {
      const key = `${tx.suggestedCategoryId}|${tx.suggestedDescription ?? ""}|${tx.suggestedMerchantName ?? ""}`;
      const group = updateGroups.get(key) ?? [];
      group.push(tx);
      updateGroups.set(key, group);
    }

    let approved = 0;

    for (const [, group] of updateGroups) {
      const representative = group[0];
      const approvalValues = buildSuggestionApprovalValues({
        suggestedDescription: representative.suggestedDescription,
        suggestedMerchantName: representative.suggestedMerchantName,
        suggestedCategoryId: representative.suggestedCategoryId!,
        description: representative.description,
        merchantName: representative.merchantName,
      });

      const ids = group.map((tx) => tx.id);
      await db
        .update(transactions)
        .set(approvalValues)
        .where(
          and(
            inArray(transactions.id, ids),
            eq(transactions.householdId, ctx.householdId),
          ),
        );

      approved += ids.length;
    }

    // Learn from approvals (batch the correction count, trigger retrain once)
    const uniqueMerchants = new Set<string>();
    for (const tx of validPending) {
      if (tx.suggestedCategoryId && tx.normalizedMerchantName) {
        uniqueMerchants.add(`${tx.suggestedCategoryId}|${tx.normalizedMerchantName}`);
      }
    }

    // Trigger retrain if approvals created meaningful learning signals
    if (approved > 0) {
      await incrementCorrectionsAndRetrain(ctx.householdId, approved);
    }

    // Count remaining suggestions beyond this batch
    const [remainingRow] = await db
      .select({ count: sql<string>`count(*)` })
      .from(transactions)
      .where(
        and(
          eq(transactions.householdId, ctx.householdId),
          isNotNull(transactions.suggestedCategoryId),
        ),
      );
    const remaining = Number(remainingRow?.count ?? 0);

    if (approved > 0) {
      writeAuditEventAsync({
        householdId: ctx.householdId,
        actorUserId: ctx.user.id,
        action: AuditAction.TRANSACTION_BULK_APPROVE,
        resourceType: "transaction",
        outcome: "success",
        metadata: { approved, remaining },
      });
    }

    return { approved, remaining };
  },
);

// ---------------------------------------------------------------------------
// deleteTransaction
// ---------------------------------------------------------------------------

export const deleteTransaction = authenticatedAction(
  "transactions.delete",
  async (ctx, input: unknown) => {
    await enforceActionRateLimit(authenticatedMutationRateLimit, ctx.user.id);

    const envelope = validateActionInput(
      transactionIdEnvelope,
      input,
      "Please provide a valid transaction ID.",
    );
    if (envelope.error) throw validationError(envelope.error.message, { fieldErrors: envelope.error.fieldErrors });
    const { transactionId } = envelope.data;

    const [deleted] = await db
      .delete(transactions)
      .where(
        and(
          eq(transactions.id, transactionId),
          eq(transactions.householdId, ctx.householdId),
        ),
      )
      .returning({ id: transactions.id, accountId: transactions.accountId });

    if (!deleted) {
      throw notFoundError("Transaction not found.", {
        transactionId,
        householdId: ctx.householdId,
      });
    }

    // Recalculate balance after deletion
    await recalculateAccountBalance({
      accountId: deleted.accountId,
      householdId: ctx.householdId,
    });

    await writeAuditEvent({
      householdId: ctx.householdId,
      actorUserId: ctx.user.id,
      action: AuditAction.TRANSACTION_DELETE,
      resourceType: "transaction",
      resourceId: transactionId,
      outcome: "success",
    });

    return { deleted: true };
  },
);

// ---------------------------------------------------------------------------
// classifyTransactions
// ---------------------------------------------------------------------------

export const classifyTransactions = authenticatedAction(
  "transactions.classify",
  async (ctx, _input: void) => {
    await enforceActionRateLimit(queueEnqueueRateLimit, ctx.user.id);

    await inngest.send({
      name: "transactions.categorize",
      data: { householdId: ctx.householdId },
    });

    return { queued: true };
  },
);
