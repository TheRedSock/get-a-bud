import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { households, transactions } from "@/db/schema";
import { withApiHandler } from "@/lib/errors/api";
import { notFoundError, validationError } from "@/lib/errors/catalog";
import { RETRAIN_CORRECTION_THRESHOLD } from "@/lib/classification/types";
import type { AutoLabelMetadata } from "@/lib/classification/relabel";
import { normalizeMerchant } from "@/lib/finance/categorization";
import { getActiveHousehold } from "@/lib/finance/household";
import { inngest } from "@/inngest/client";

type TransactionMetadata = Record<string, unknown> & {
  autoLabel?: AutoLabelMetadata;
};

/**
 * POST /api/transactions/[transactionId]/undo-auto-label
 *
 * Reverts an auto-applied label (category + relabeled description/merchant).
 * Restores the original values from `metadata.autoLabel` and marks it as undone.
 * This counts as a negative signal for learning (user rejected the classification).
 */
export const POST = withApiHandler(
  "transactions.undo-auto-label",
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
        metadata: {
          ...metadata,
          autoLabel: { ...autoLabel, undone: true },
        },
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, transactionId))
      .returning();

    // Undo counts as a negative signal — increment correction counter.
    // The user rejected the system's classification, so we want to retrain
    // the model to learn from this rejection.
    const [hh] = await db
      .update(households)
      .set({
        classificationCorrectionsSinceTrain: sql`${households.classificationCorrectionsSinceTrain} + 1`,
      })
      .where(eq(households.id, household.householdId))
      .returning({
        corrections: households.classificationCorrectionsSinceTrain,
      });

    if (hh && hh.corrections >= RETRAIN_CORRECTION_THRESHOLD) {
      await inngest.send({
        name: "model.retrain",
        data: { householdId: household.householdId },
      });
    }

    return NextResponse.json({ transaction: updated });
  },
);
