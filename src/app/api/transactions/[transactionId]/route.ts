import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import {
  categories,
  financialAccounts,
  households,
  transactions,
} from "@/db/schema";
import { validateJsonBody, withApiHandler } from "@/lib/errors/api";
import { notFoundError, validationError } from "@/lib/errors/catalog";
import { RETRAIN_CORRECTION_THRESHOLD } from "@/lib/classification/types";
import { recalculateAccountBalance } from "@/lib/finance/balance";
import {
  learnCategoryCorrection,
  normalizeMerchant,
} from "@/lib/finance/categorization";
import {
  getCategoryLearningTarget,
  updateMerchantCanonicalName,
  upsertMerchantFromUserCorrection,
} from "@/lib/finance/merchants";
import { getActiveHousehold } from "@/lib/finance/household";

import { updateTransactionSchema } from "@/lib/finance/validation";
import { inngest } from "@/inngest/client";

type TransactionMetadata = Record<string, unknown> & {
  parsed?: {
    counterparty?: string | null;
  };
  userEdits?: {
    descriptionEdited?: boolean;
    merchantNameEdited?: boolean;
    originalDescription?: string;
    originalMerchantName?: string | null;
    updatedAt?: string;
  };
};

export const PATCH = withApiHandler(
  "transactions.update",
  async (
    request: Request,
    { params }: { params: Promise<{ transactionId: string }> },
  ) => {
    const { transactionId } = await params;
    const household = await getActiveHousehold();
    const transactionInput = await validateJsonBody(
      request,
      updateTransactionSchema,
      "Please provide valid transaction details.",
    );

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

    const syncedImmutableFields = ["accountId", "amountCents", "currency", "date"] as const;
    const attemptedSyncedEdits = syncedImmutableFields.filter(
      (field) => transactionInput[field] !== undefined,
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

    if (transactionInput.accountId) {
      const [account] = await db
        .select({ id: financialAccounts.id })
        .from(financialAccounts)
        .where(
          and(
            eq(financialAccounts.id, transactionInput.accountId),
            eq(financialAccounts.householdId, household.householdId),
          ),
        )
        .limit(1);

      if (!account) {
        throw notFoundError("Choose an account from this household.", {
          accountId: transactionInput.accountId,
          householdId: household.householdId,
        });
      }
    }

    const nextDescription =
      transactionInput.description !== undefined
        ? transactionInput.description
        : transaction.description;
    const nextMerchantName =
      transactionInput.merchantName !== undefined
        ? transactionInput.merchantName
        : transaction.merchantName;
    const metadata = (transaction.metadata ?? {}) as TransactionMetadata;
    const userEdits = { ...(metadata.userEdits ?? {}) };
    const values: Partial<typeof transactions.$inferInsert> = {
      description: nextDescription,
      updatedAt: new Date(),
      searchText: `${nextDescription} ${nextMerchantName ?? ""}`,
      normalizedMerchantName: normalizeMerchant(nextMerchantName ?? nextDescription),
    };

    if (
      transaction.source !== "manual" &&
      transactionInput.description !== undefined &&
      transactionInput.description !== transaction.description
    ) {
      userEdits.descriptionEdited = true;
      userEdits.originalDescription =
        userEdits.originalDescription ?? transaction.description;
      userEdits.updatedAt = new Date().toISOString();
      values.metadata = {
        ...metadata,
        userEdits,
      };
    }

    if (transactionInput.categoryId !== undefined) {
      if (transactionInput.categoryId !== null) {
        const [cat] = await db
          .select({ id: categories.id })
          .from(categories)
          .where(
            and(
              eq(categories.id, transactionInput.categoryId),
              eq(categories.householdId, household.householdId),
            ),
          )
          .limit(1);

        if (!cat) {
          throw notFoundError("Choose a category from this household.", {
            categoryId: transactionInput.categoryId,
            householdId: household.householdId,
          });
        }
      }

      values.categoryId = transactionInput.categoryId;

      if (transactionInput.categoryId === null) {
        // Uncategorizing: clear all classification metadata so stale
        // confidence/source/suggestions don't persist.
        values.categorySource = null;
        values.categoryConfidence = null;
        values.suggestedCategoryId = null;
        values.suggestedDescription = null;
        values.suggestedMerchantName = null;
      } else if (transactionInput.categoryId !== transaction.categoryId) {
        // User set a new category
        values.categorySource = "user";
        values.categoryConfidence = "1.00";
        // Clear any pending suggestion once the user has chosen
        values.suggestedCategoryId = null;
        values.suggestedDescription = null;
        values.suggestedMerchantName = null;
      }
    }

    if (transactionInput.merchantName !== undefined) {
      values.merchantName = transactionInput.merchantName;

      if (
        transaction.source !== "manual" &&
        transactionInput.merchantName !== transaction.merchantName
      ) {
        userEdits.merchantNameEdited = true;
        userEdits.originalMerchantName =
          userEdits.originalMerchantName ?? transaction.merchantName;
        userEdits.updatedAt = new Date().toISOString();
        values.metadata = {
          ...metadata,
          userEdits,
        };
      }
    }

    if (transactionInput.notes !== undefined) {
      values.notes = transactionInput.notes;
    }

    if (transactionInput.status !== undefined) {
      values.status = transactionInput.status;
    }

    if (transactionInput.excludedFromBudget !== undefined) {
      values.excludedFromBudget = transactionInput.excludedFromBudget;
    }
    if (transaction.source === "manual") {
      if (transactionInput.accountId !== undefined) {
        values.accountId = transactionInput.accountId;
      }

      if (transactionInput.amountCents !== undefined) {
        values.amountCents = transactionInput.amountCents;
      }

      if (transactionInput.currency !== undefined) {
        values.currency = transactionInput.currency;
      }

      if (transactionInput.date !== undefined) {
        values.date = transactionInput.date;
      }
    }

    const [updatedTransaction] = await db
      .update(transactions)
      .set(values)
      .where(eq(transactions.id, transaction.id))
      .returning();

    if (
      transactionInput.merchantName !== undefined &&
      transactionInput.merchantName !== transaction.merchantName &&
      updatedTransaction.merchantId &&
      transactionInput.merchantName
    ) {
      await updateMerchantCanonicalName({
        householdId: household.householdId,
        merchantId: updatedTransaction.merchantId,
        canonicalName: transactionInput.merchantName,
      });
    }

    // Phase 1B: learn categorization rule from user's category edit
    if (
      transactionInput.categoryId !== undefined &&
      transactionInput.categoryId !== null &&
      transactionInput.categoryId !== transaction.categoryId
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
          householdId: household.householdId,
          categoryId: transactionInput.categoryId,
          matcher: learningTarget.matcher,
          matchField: learningTarget.matchField,
          transactionId: transaction.id,
        });

        await upsertMerchantFromUserCorrection({
          householdId: household.householdId,
          categoryId: transactionInput.categoryId,
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

        // Phase 3A: Increment correction counter and trigger retrain when
        // enough corrections have accumulated since the last model training.
        // Counter only advances when a rule was actually learned (matcher
        // was long enough), so that trivial edits with short/empty matchers
        // don't dilute the retrain signal.
        const [updated] = await db
          .update(households)
          .set({
            classificationCorrectionsSinceTrain: sql`${households.classificationCorrectionsSinceTrain} + 1`,
          })
          .where(eq(households.id, household.householdId))
          .returning({
            corrections: households.classificationCorrectionsSinceTrain,
          });

        if (
          updated &&
          updated.corrections >= RETRAIN_CORRECTION_THRESHOLD
        ) {
          await inngest.send({
            name: "model.retrain",
            data: { householdId: household.householdId },
          });
        }
      }
    }

    // Recalculate balances when amount or account changes on manual transactions
    const amountChanged =
      transactionInput.amountCents !== undefined &&
      transactionInput.amountCents !== transaction.amountCents;
    const accountChanged =
      transactionInput.accountId !== undefined &&
      transactionInput.accountId !== transaction.accountId;

    if (amountChanged || accountChanged) {
      await recalculateAccountBalance(updatedTransaction.accountId);
      // If the transaction moved to a different account, recalculate the old one too
      if (accountChanged) {
        await recalculateAccountBalance(transaction.accountId);
      }
    }

    return NextResponse.json({ transaction: updatedTransaction });
  },
);
