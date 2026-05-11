import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { financialAccounts, transactions } from "@/db/schema";
import { validateJsonBody, withApiHandler } from "@/lib/errors/api";
import { notFoundError, validationError } from "@/lib/errors/catalog";
import { normalizeMerchant } from "@/lib/finance/categorization";
import { getActiveHousehold } from "@/lib/finance/household";
import { updateTransactionSchema } from "@/lib/finance/validation";

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

    const syncedImmutableFields = ["accountId", "amount", "currency", "date"] as const;
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
      transaction.source === "manual" && transactionInput.description !== undefined
        ? transactionInput.description
        : transaction.description;
    const nextMerchantName =
      transactionInput.merchantName !== undefined
        ? transactionInput.merchantName
        : transaction.merchantName;
    const values: Partial<typeof transactions.$inferInsert> = {
      updatedAt: new Date(),
      searchText: `${nextDescription} ${nextMerchantName ?? ""}`,
      normalizedMerchantName: normalizeMerchant(nextMerchantName ?? nextDescription),
    };

    if (transactionInput.categoryId !== undefined) {
      values.categoryId = transactionInput.categoryId;
    }

    if (transactionInput.merchantName !== undefined) {
      values.merchantName = transactionInput.merchantName;
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

      if (transactionInput.amount !== undefined) {
        values.amount = transactionInput.amount.toFixed(2);
      }

      if (transactionInput.currency !== undefined) {
        values.currency = transactionInput.currency;
      }

      if (transactionInput.date !== undefined) {
        values.date = transactionInput.date;
      }

      if (transactionInput.description !== undefined) {
        values.description = transactionInput.description;
      }
    }

    const [updatedTransaction] = await db
      .update(transactions)
      .set(values)
      .where(eq(transactions.id, transaction.id))
      .returning();

    return NextResponse.json({ transaction: updatedTransaction });
  },
);
