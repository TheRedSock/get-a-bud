"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { financialAccounts, transactions } from "@/db/schema";
import {
  authenticatedAction,
  validateActionInput,
} from "@/lib/actions/safe-action";
import { AuditAction, writeAuditEvent } from "@/lib/audit";
import { forbiddenError, notFoundError, validationError } from "@/lib/errors/catalog";
import {
  createAccountSchema,
  updateAccountSchema,
} from "@/lib/finance/validation";
import { requireStepUp } from "@/lib/auth/step-up";
import { enforceRateLimit } from "@/lib/security/rate-limit";

// ---------------------------------------------------------------------------
// Envelope schemas
// ---------------------------------------------------------------------------

const accountUpdateEnvelope = z.object({
  accountId: z.string().min(1),
  data: z.unknown(),
});

// ---------------------------------------------------------------------------
// createAccount
// ---------------------------------------------------------------------------

export const createAccount = authenticatedAction(
  "accounts.create",
  async (ctx, input: unknown) => {
    await enforceRateLimit("authenticatedMutation", { userId: ctx.user.id });

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

    await writeAuditEvent({
      householdId: ctx.householdId,
      actorUserId: ctx.user.id,
      action: AuditAction.ACCOUNT_CONNECT,
      resourceType: "financial_account",
      resourceId: account.id,
      outcome: "success",
      metadata: { kind: accountInput.kind, isManual: true },
    });

    return { account };
  },
);

// ---------------------------------------------------------------------------
// updateAccount
// ---------------------------------------------------------------------------

export const updateAccount = authenticatedAction(
  "accounts.update",
  async (ctx, input: unknown) => {
    await enforceRateLimit("authenticatedMutation", { userId: ctx.user.id });

    const envelope = validateActionInput(
      accountUpdateEnvelope,
      input,
      "Please provide a valid account ID.",
    );
    if (envelope.error) throw validationError(envelope.error.message, { fieldErrors: envelope.error.fieldErrors });
    const { accountId, data } = envelope.data;

    const validated = validateActionInput(
      updateAccountSchema,
      data,
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
          eq(financialAccounts.id, accountId),
          eq(financialAccounts.householdId, ctx.householdId),
        ),
      )
      .returning();

    if (!account) {
      throw notFoundError("Account not found.", {
        accountId,
        householdId: ctx.householdId,
      });
    }

    await writeAuditEvent({
      householdId: ctx.householdId,
      actorUserId: ctx.user.id,
      action: AuditAction.ACCOUNT_UPDATE,
      resourceType: "financial_account",
      resourceId: accountId,
      outcome: "success",
    });

    return { account };
  },
);

// ---------------------------------------------------------------------------
// Envelope schemas (delete)
// ---------------------------------------------------------------------------

const accountIdEnvelope = z.object({
  accountId: z.string().min(1),
});

// ---------------------------------------------------------------------------
// deleteAccount
// ---------------------------------------------------------------------------

export const deleteAccount = authenticatedAction(
  "accounts.delete",
  async (ctx, input: unknown) => {
    await enforceRateLimit("authenticatedMutation", { userId: ctx.user.id });
    await requireStepUp(ctx.user.id);

    const envelope = validateActionInput(
      accountIdEnvelope,
      input,
      "Please provide a valid account ID.",
    );
    if (envelope.error) throw validationError(envelope.error.message, { fieldErrors: envelope.error.fieldErrors });
    const { accountId } = envelope.data;

    // Pre-check: only manual accounts may be deleted directly
    const [account] = await db
      .select({
        id: financialAccounts.id,
        isManual: financialAccounts.isManual,
      })
      .from(financialAccounts)
      .where(
        and(
          eq(financialAccounts.id, accountId),
          eq(financialAccounts.householdId, ctx.householdId),
        ),
      )
      .limit(1);

    if (!account) {
      throw notFoundError("Account not found.", {
        accountId,
        householdId: ctx.householdId,
      });
    }

    if (!account.isManual) {
      throw forbiddenError(
        "Provider-synced accounts must be disconnected, not deleted.",
      );
    }

    // Delete transactions then account (cascade would handle this,
    // but explicit deletion is clearer for audit trail)
    await db
      .delete(transactions)
      .where(
        and(
          eq(transactions.accountId, accountId),
          eq(transactions.householdId, ctx.householdId),
        ),
      );

    await db
      .delete(financialAccounts)
      .where(
        and(
          eq(financialAccounts.id, accountId),
          eq(financialAccounts.householdId, ctx.householdId),
        ),
      );

    await writeAuditEvent({
      householdId: ctx.householdId,
      actorUserId: ctx.user.id,
      action: AuditAction.ACCOUNT_DISCONNECT,
      resourceType: "financial_account",
      resourceId: accountId,
      outcome: "success",
      metadata: { reason: "user_deleted" },
    });

    return { deleted: true };
  },
);
