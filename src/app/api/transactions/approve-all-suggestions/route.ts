import { and, eq, isNotNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { categories, households, transactions } from "@/db/schema";
import { withApiHandler } from "@/lib/errors/api";
import { rateLimitedError } from "@/lib/errors/catalog";
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
import { bulkOperationRateLimit } from "@/lib/security/arcjet";
import { inngest } from "@/inngest/client";

/**
 * POST /api/transactions/approve-all-suggestions
 *
 * Batch-approves all amber-zone suggestions for the active household.
 * Copies suggested values to actual fields, triggers learning for each.
 */
export const POST = withApiHandler(
  "transactions.approve-all-suggestions",
  async (request) => {
    const decision = await bulkOperationRateLimit.protect(request);
    if (decision.isDenied()) {
      throw rateLimitedError("Too many bulk operations. Please try again shortly.");
    }

    const household = await getActiveHousehold();

    // Load all transactions with pending suggestions
    const pending = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.householdId, household.householdId),
          isNotNull(transactions.suggestedCategoryId),
        ),
      );

    if (pending.length === 0) {
      return NextResponse.json({ approved: 0 });
    }

    // Validate that all suggested categories still exist in this household
    const suggestedCatIds = [
      ...new Set(
        pending
          .map((t) => t.suggestedCategoryId)
          .filter((id): id is string => id !== null),
      ),
    ];

    const validCats = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.householdId, household.householdId),
        ),
      );

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

      const nextDescription =
        transaction.suggestedDescription ?? transaction.description;
      const nextMerchantName =
        transaction.suggestedMerchantName ?? transaction.merchantName;

      await db
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
        .where(eq(transactions.id, transaction.id));

      approved += 1;

      // Trigger learning
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
          transactionId: transaction.id,
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
        corrections += 1;
      }
    }

    // Increment correction counter in one shot for all learned corrections
    if (corrections > 0) {
      const [hh] = await db
        .update(households)
        .set({
          classificationCorrectionsSinceTrain: sql`${households.classificationCorrectionsSinceTrain} + ${corrections}`,
        })
        .where(eq(households.id, household.householdId))
        .returning({
          correctionCount: households.classificationCorrectionsSinceTrain,
        });

      if (hh && hh.correctionCount >= RETRAIN_CORRECTION_THRESHOLD) {
        await inngest.send({
          name: "model.retrain",
          data: { householdId: household.householdId },
        });
      }
    }

    return NextResponse.json({ approved });
  },
);
