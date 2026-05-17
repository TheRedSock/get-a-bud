/**
 * Transaction domain commands.
 *
 * Business policy for transaction review, category correction, and undo
 * operations. These functions encapsulate the decision logic that actions
 * orchestrate but do not own.
 */

import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { households, transactions } from "@/db/schema";
import { inngest } from "@/inngest/client";
import { RETRAIN_CORRECTION_THRESHOLD } from "@/lib/classification/types";
import {
  learnCategoryCorrection,
  normalizeMerchant,
} from "@/lib/finance/categorization";
import {
  getCategoryLearningTarget,
  upsertMerchantFromUserCorrection,
} from "@/lib/finance/merchants";
import type { AutoLabelMetadata } from "@/lib/classification/relabel";

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

export type TransactionForLearning = {
  id: string;
  householdId: string;
  source: string;
  description: string;
  merchantName: string | null;
  normalizedMerchantName: string | null;
  transactionType: string | null;
  paymentChannel: string | null;
  metadata: Record<string, unknown> | null;
};

// ---------------------------------------------------------------------------
// Category correction learning
// ---------------------------------------------------------------------------

/**
 * Learn a category correction from a user's explicit category assignment.
 *
 * This encapsulates:
 * 1. Getting the learning target from the transaction
 * 2. Recording the category correction rule
 * 3. Upserting merchant from user correction
 * 4. Incrementing the household correction counter
 * 5. Triggering retrain if threshold is met
 */
export async function learnFromCategoryCorrection(opts: {
  householdId: string;
  categoryId: string;
  transaction: TransactionForLearning;
  displayMerchantName: string | null | undefined;
}): Promise<{ learned: boolean; retrained: boolean }> {
  const { householdId, categoryId, transaction, displayMerchantName } = opts;

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

  if (!learningTarget) {
    return { learned: false, retrained: false };
  }

  await learnCategoryCorrection({
    householdId,
    categoryId,
    matcher: learningTarget.matcher,
    matchField: learningTarget.matchField,
    transactionId: transaction.id,
  });

  await upsertMerchantFromUserCorrection({
    householdId,
    categoryId,
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
    displayMerchantName,
  });

  const retrained = await incrementCorrectionsAndRetrain(householdId, 1);

  return { learned: true, retrained };
}

/**
 * Batch-learn corrections and trigger retrain if threshold is met.
 *
 * Used by bulk operations like approveAllSuggestions.
 */
export async function incrementCorrectionsAndRetrain(
  householdId: string,
  count: number,
): Promise<boolean> {
  if (count <= 0) return false;

  const [hh] = await db
    .update(households)
    .set({
      classificationCorrectionsSinceTrain: sql`${households.classificationCorrectionsSinceTrain} + ${count}`,
    })
    .where(eq(households.id, householdId))
    .returning({ corrections: households.classificationCorrectionsSinceTrain });

  if (hh && hh.corrections >= RETRAIN_CORRECTION_THRESHOLD) {
    await inngest.send({
      name: "model.retrain",
      data: { householdId },
    });
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Suggestion approval
// ---------------------------------------------------------------------------

/**
 * Apply a suggested category to a transaction.
 *
 * Returns the update values to be set on the transaction row.
 */
export function buildSuggestionApprovalValues(transaction: {
  suggestedDescription: string | null;
  suggestedMerchantName: string | null;
  suggestedCategoryId: string;
  description: string;
  merchantName: string | null;
}) {
  const nextDescription =
    transaction.suggestedDescription ?? transaction.description;
  const nextMerchantName =
    transaction.suggestedMerchantName ?? transaction.merchantName;

  return {
    categoryId: transaction.suggestedCategoryId,
    description: nextDescription,
    merchantName: nextMerchantName,
    normalizedMerchantName: normalizeMerchant(nextMerchantName ?? nextDescription),
    searchText: `${nextDescription} ${nextMerchantName ?? ""}`,
    categorySource: "user" as const,
    categoryConfidence: "1.00",
    suggestedCategoryId: null,
    suggestedDescription: null,
    suggestedMerchantName: null,
    updatedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Undo auto-label
// ---------------------------------------------------------------------------

/**
 * Build the values to restore a transaction to its pre-auto-label state.
 *
 * Returns null if there is no auto-label to undo.
 */
export function buildUndoAutoLabelValues(metadata: unknown): {
  values: Partial<typeof transactions.$inferInsert>;
} | null {
  const meta = (metadata ?? {}) as TransactionMetadata;
  const autoLabel = meta.autoLabel;

  if (!autoLabel || autoLabel.undone) {
    return null;
  }

  const restoredDescription = autoLabel.originalDescription;
  const restoredMerchantName = autoLabel.originalMerchantName;

  return {
    values: {
      description: restoredDescription,
      merchantName: restoredMerchantName,
      normalizedMerchantName: normalizeMerchant(
        restoredMerchantName ?? restoredDescription,
      ),
      searchText: `${restoredDescription} ${restoredMerchantName ?? ""}`,
      categoryId: null,
      categorySource: null,
      categoryConfidence: null,
      suggestedCategoryId: null,
      suggestedDescription: null,
      suggestedMerchantName: null,
      metadata: { ...meta, autoLabel: { ...autoLabel, undone: true } },
      updatedAt: new Date(),
    },
  };
}
