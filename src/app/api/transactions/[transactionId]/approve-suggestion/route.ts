import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { categories, households, transactions } from "@/db/schema";
import { withApiHandler } from "@/lib/errors/api";
import { notFoundError, validationError } from "@/lib/errors/catalog";
import { RETRAIN_CORRECTION_THRESHOLD } from "@/lib/classification/types";
import {
  learnCategoryCorrection,
  normalizeMerchant,
} from "@/lib/finance/categorization";
import {
  getCategoryLearningTarget,
  upsertMerchantFromUserCorrection,
} from "@/lib/finance/merchants";
import { getActiveHousehold } from "@/lib/finance/household";
import { inngest } from "@/inngest/client";

/**
 * POST /api/transactions/[transactionId]/approve-suggestion
 *
 * Copies the amber-zone suggestion to actual fields, marks the transaction
 * as user-confirmed, triggers category learning, and clears the suggestion.
 */
export const POST = withApiHandler(
  "transactions.approve-suggestion",
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
      throw validationError("No suggestion to approve.");
    }

    // Validate that the suggested category still belongs to this household
    const [cat] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.id, transaction.suggestedCategoryId),
          eq(categories.householdId, household.householdId),
        ),
      )
      .limit(1);

    if (!cat) {
      throw validationError(
        "The suggested category is no longer available. Please choose a category manually.",
      );
    }

    const nextDescription =
      transaction.suggestedDescription ?? transaction.description;
    const nextMerchantName =
      transaction.suggestedMerchantName ?? transaction.merchantName;

    const [updated] = await db
      .update(transactions)
      .set({
        categoryId: transaction.suggestedCategoryId,
        description: nextDescription,
        merchantName: nextMerchantName,
        normalizedMerchantName: normalizeMerchant(
          nextMerchantName ?? nextDescription,
        ),
        searchText: `${nextDescription} ${nextMerchantName ?? ""}`,
        categorySource: "user",
        categoryConfidence: "1.00",
        suggestedCategoryId: null,
        suggestedDescription: null,
        suggestedMerchantName: null,
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, transactionId))
      .returning();

    // Trigger learning from this approval
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
        householdId: household.householdId,
        categoryId: transaction.suggestedCategoryId,
        matcher: learningTarget.matcher,
        matchField: learningTarget.matchField,
        transactionId,
      });

      await upsertMerchantFromUserCorrection({
        householdId: household.householdId,
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
    }

    return NextResponse.json({ transaction: updated });
  },
);
