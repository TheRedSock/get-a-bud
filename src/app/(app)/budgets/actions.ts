"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { budgets } from "@/db/schema";
import {
  authenticatedAction,
  validateActionInput,
} from "@/lib/actions/safe-action";
import { AuditAction, writeAuditEvent } from "@/lib/audit";
import { notFoundError, validationError } from "@/lib/errors/catalog";
import { createBudgetSchema } from "@/lib/finance/validation";
import { enforceRateLimit } from "@/lib/security/rate-limit";

// ---------------------------------------------------------------------------
// Envelope schemas
// ---------------------------------------------------------------------------

const budgetIdEnvelope = z.object({
  budgetId: z.string().min(1),
});

const budgetUpdateEnvelope = z.object({
  budgetId: z.string().min(1),
  data: z.unknown(),
});

const updateBudgetSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  type: z.enum(["monthly", "weekly", "zero_based", "envelope"]).optional(),
  currency: z.string().trim().toUpperCase().length(3).optional(),
  periodStartDay: z.coerce.number().int().min(1).max(31).optional(),
  paycheckAnchorDay: z.coerce.number().int().min(1).max(31).nullable().optional(),
  isActive: z.coerce.boolean().optional(),
});

// ---------------------------------------------------------------------------
// createBudget
// ---------------------------------------------------------------------------

export const createBudget = authenticatedAction(
  "budgets.create",
  async (ctx, input: unknown) => {
    await enforceRateLimit("authenticatedMutation", { userId: ctx.user.id });

    const validated = validateActionInput(
      createBudgetSchema,
      input,
      "Please provide a valid budget name, type and period settings.",
    );
    if (validated.error) throw validationError(validated.error.message, { fieldErrors: validated.error.fieldErrors });
    const budgetInput = validated.data;

    const [budget] = await db
      .insert(budgets)
      .values({
        householdId: ctx.householdId,
        name: budgetInput.name,
        type: budgetInput.type,
        currency: budgetInput.currency,
        periodStartDay: budgetInput.periodStartDay,
        paycheckAnchorDay: budgetInput.paycheckAnchorDay,
      })
      .returning();

    await writeAuditEvent({
      householdId: ctx.householdId,
      actorUserId: ctx.user.id,
      action: AuditAction.BUDGET_CREATE,
      resourceType: "budget",
      resourceId: budget.id,
      outcome: "success",
    });

    return { budget };
  },
);

// ---------------------------------------------------------------------------
// updateBudget
// ---------------------------------------------------------------------------

export const updateBudget = authenticatedAction(
  "budgets.update",
  async (ctx, input: unknown) => {
    await enforceRateLimit("authenticatedMutation", { userId: ctx.user.id });

    const envelope = validateActionInput(
      budgetUpdateEnvelope,
      input,
      "Please provide a valid budget ID.",
    );
    if (envelope.error) throw validationError(envelope.error.message, { fieldErrors: envelope.error.fieldErrors });
    const { budgetId, data } = envelope.data;

    const validated = validateActionInput(
      updateBudgetSchema,
      data,
      "Please provide valid budget details.",
    );
    if (validated.error) throw validationError(validated.error.message, { fieldErrors: validated.error.fieldErrors });
    const budgetInput = validated.data;

    const [budget] = await db
      .update(budgets)
      .set({
        ...budgetInput,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(budgets.id, budgetId),
          eq(budgets.householdId, ctx.householdId),
        ),
      )
      .returning();

    if (!budget) {
      throw notFoundError("Budget not found.", {
        budgetId,
        householdId: ctx.householdId,
      });
    }

    await writeAuditEvent({
      householdId: ctx.householdId,
      actorUserId: ctx.user.id,
      action: AuditAction.BUDGET_UPDATE,
      resourceType: "budget",
      resourceId: budgetId,
      outcome: "success",
    });

    return { budget };
  },
);

// ---------------------------------------------------------------------------
// deleteBudget
// ---------------------------------------------------------------------------

export const deleteBudget = authenticatedAction(
  "budgets.delete",
  async (ctx, input: unknown) => {
    await enforceRateLimit("authenticatedMutation", { userId: ctx.user.id });

    const envelope = validateActionInput(
      budgetIdEnvelope,
      input,
      "Please provide a valid budget ID.",
    );
    if (envelope.error) throw validationError(envelope.error.message, { fieldErrors: envelope.error.fieldErrors });
    const { budgetId } = envelope.data;

    const [deleted] = await db
      .delete(budgets)
      .where(
        and(
          eq(budgets.id, budgetId),
          eq(budgets.householdId, ctx.householdId),
        ),
      )
      .returning({ id: budgets.id });

    if (!deleted) {
      throw notFoundError("Budget not found.", {
        budgetId,
        householdId: ctx.householdId,
      });
    }

    await writeAuditEvent({
      householdId: ctx.householdId,
      actorUserId: ctx.user.id,
      action: AuditAction.BUDGET_DELETE,
      resourceType: "budget",
      resourceId: budgetId,
      outcome: "success",
    });

    return { deleted: true };
  },
);
