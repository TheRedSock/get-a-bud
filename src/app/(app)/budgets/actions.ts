"use server";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { budgets } from "@/db/schema";
import {
  authenticatedAction,
  validateActionInput,
} from "@/lib/actions/safe-action";
import { validationError } from "@/lib/errors/catalog";
import { createBudgetSchema } from "@/lib/finance/validation";

// ---------------------------------------------------------------------------
// createBudget
// ---------------------------------------------------------------------------

export const createBudget = authenticatedAction(
  "budgets.create",
  async (ctx, input: unknown) => {
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

    return { budget };
  },
);
