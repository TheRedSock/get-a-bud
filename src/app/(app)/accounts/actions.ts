"use server";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { financialAccounts, transactions } from "@/db/schema";
import {
  authenticatedAction,
  validateActionInput,
} from "@/lib/actions/safe-action";
import { notFoundError, validationError } from "@/lib/errors/catalog";
import {
  createAccountSchema,
  updateAccountSchema,
} from "@/lib/finance/validation";

// ---------------------------------------------------------------------------
// createAccount
// ---------------------------------------------------------------------------

export const createAccount = authenticatedAction(
  "accounts.create",
  async (ctx, input: unknown) => {
    const validated = validateActionInput(
      createAccountSchema,
      input,
      "Please provide a valid account name, type, currency and balance.",
    );
    if (validated.error) throw validationError(validated.error.message, { fieldErrors: validated.error.fieldErrors });
    const accountInput = validated.data;

    const openingBalanceCents = accountInput.currentBalanceCents;

    const account = await db.transaction(async (tx) => {
      const [createdAccount] = await tx
        .insert(financialAccounts)
        .values({
          householdId: ctx.householdId,
          name: accountInput.name,
          kind: accountInput.kind,
          currency: accountInput.currency,
          currentBalanceCents: openingBalanceCents,
          institutionName: accountInput.institutionName,
          isManual: true,
        })
        .returning();

      // Opening balance transaction for ledger consistency
      if (openingBalanceCents !== 0) {
        await tx.insert(transactions).values({
          householdId: ctx.householdId,
          accountId: createdAccount.id,
          amountCents: openingBalanceCents,
          currency: accountInput.currency,
          date: new Date().toISOString().slice(0, 10),
          description: "Opening balance",
          searchText: "Opening balance",
          source: "manual",
          metadata: { isOpeningBalance: true },
        });
      }

      return createdAccount;
    });

    return { account };
  },
);

// ---------------------------------------------------------------------------
// updateAccount
// ---------------------------------------------------------------------------

export const updateAccount = authenticatedAction(
  "accounts.update",
  async (ctx, input: { accountId: string; data: unknown }) => {
    const validated = validateActionInput(
      updateAccountSchema,
      input.data,
      "Please provide valid account details.",
    );
    if (validated.error) throw validationError(validated.error.message, { fieldErrors: validated.error.fieldErrors });
    const accountInput = validated.data;

    const [account] = await db
      .update(financialAccounts)
      .set({
        ...accountInput,
        institutionName:
          accountInput.institutionName === undefined
            ? undefined
            : accountInput.institutionName,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(financialAccounts.id, input.accountId),
          eq(financialAccounts.householdId, ctx.householdId),
        ),
      )
      .returning();

    if (!account) {
      throw notFoundError("Account not found.", {
        accountId: input.accountId,
        householdId: ctx.householdId,
      });
    }

    return { account };
  },
);
