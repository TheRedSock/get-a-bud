import { and, desc, eq, isNotNull, lt, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { classificationModels, households, transactions } from "@/db/schema";
import { trainModel } from "@/lib/classification/model";
import { inngest } from "@/inngest/client";
import { parseJobEvent, retrainModelSchema } from "@/inngest/lib/event-validation";
import { EVENT_NAMES, retrainModelEvent } from "@/inngest/lib/events";
import { sendValidatedStepEvent } from "@/inngest/lib/send-event";

export const MAX_TRAINING_ROWS = 5_000;

export async function loadTrainingRowsForHousehold(householdId: string) {
  return db
    .select({
      description: transactions.description,
      merchantName: transactions.merchantName,
      normalizedMerchantName: transactions.normalizedMerchantName,
      amountCents: transactions.amountCents,
      date: transactions.date,
      transactionType: transactions.transactionType,
      paymentChannel: transactions.paymentChannel,
      originalCurrency: transactions.originalCurrency,
      categoryId: transactions.categoryId,
      categorySource: transactions.categorySource,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, householdId),
        isNotNull(transactions.categoryId),
        or(
          eq(transactions.categorySource, "user"),
          eq(transactions.categorySource, "rule"),
          eq(transactions.categorySource, "merchant"),
        ),
      ),
    )
    .orderBy(desc(transactions.date))
    .limit(MAX_TRAINING_ROWS);
}

export const retrainClassificationModel = inngest.createFunction(
  {
    id: "retrain-classification-model",
    name: "Retrain classification model",
    triggers: retrainModelEvent,
  },
  async ({ event, step }) => {
    const { householdId } = parseJobEvent(retrainModelSchema, event.data, {
      eventName: EVENT_NAMES.retrainModel,
    });

    const trainingData = await step.run("load-training-data", () =>
      loadTrainingRowsForHousehold(householdId),
    );

    if (trainingData.length < 20) {
      return {
        skipped: true,
        reason: "insufficient_data",
        count: trainingData.length,
      };
    }

    // SQL guarantees categoryId IS NOT NULL; non-null assertion is safe
    const labeled = trainingData.map((t) => ({
      description: t.description,
      merchantName: t.merchantName,
      normalizedMerchantName: t.normalizedMerchantName,
      amountCents: t.amountCents,
      date: t.date,
      transactionType: t.transactionType,
      paymentChannel: t.paymentChannel,
      originalCurrency: t.originalCurrency,
      categoryId: t.categoryId!,
    }));

    const modelOutput = await step.run("train-model", () =>
      trainModel(labeled),
    );

    if (!modelOutput) {
      return {
        skipped: true,
        reason: "insufficient_labeled",
        count: labeled.length,
      };
    }

    // Determine the next version number
    const [latestVersion] = await step.run("get-latest-version", () =>
      db
        .select({
          maxVersion: sql<number>`COALESCE(MAX(${classificationModels.version}), 0)`,
        })
        .from(classificationModels)
        .where(eq(classificationModels.householdId, householdId)),
    );

    const nextVersion = (latestVersion?.maxVersion ?? 0) + 1;

    // Store the model
    await step.run("save-model", () =>
      db.insert(classificationModels).values({
        householdId,
        modelData: JSON.parse(modelOutput.modelJson) as unknown[],
        version: nextVersion,
        trainedAt: new Date(),
        trainingTransactionCount: modelOutput.trainingCount,
        accuracy: modelOutput.accuracy.toFixed(3),
        autoApplyThreshold:
          modelOutput.thresholds.autoApplyThreshold?.toFixed(2) ?? null,
        suggestThreshold:
          modelOutput.thresholds.suggestThreshold?.toFixed(2) ?? null,
        metadata: {
          categoryCount: modelOutput.categoryCount,
        },
      }),
    );

    // Reset correction counter
    await step.run("reset-counter", () =>
      db
        .update(households)
        .set({ classificationCorrectionsSinceTrain: 0 })
        .where(eq(households.id, householdId)),
    );

    // Prune old model versions (keep last 3)
    if (nextVersion > 3) {
      await step.run("prune-old-models", () =>
        db
          .delete(classificationModels)
          .where(
            and(
              eq(classificationModels.householdId, householdId),
              lt(classificationModels.version, nextVersion - 2),
            ),
          ),
      );
    }

    await sendValidatedStepEvent(
      step,
      "classify-after-retrain",
      EVENT_NAMES.categorizeTransactions,
      { householdId },
    );

    return {
      trained: true,
      version: nextVersion,
      trainingCount: modelOutput.trainingCount,
      categoryCount: modelOutput.categoryCount,
      accuracy: modelOutput.accuracy,
      autoApplyThreshold: modelOutput.thresholds.autoApplyThreshold,
      suggestThreshold: modelOutput.thresholds.suggestThreshold,
      capped: trainingData.length >= MAX_TRAINING_ROWS,
      loaded: trainingData.length,
    };
  },
);
