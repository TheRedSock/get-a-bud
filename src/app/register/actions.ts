"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  budgetLines,
  budgets,
  categories,
  categorizationRules,
  categoryGroups,
  households,
  memberships,
  users,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { enforceActionRateLimit, registerRateLimit } from "@/lib/security/arcjet";
import {
  defaultCategories,
  defaultGroups,
  defaultMerchantRules,
} from "@/lib/finance/defaults";
import { normalizeMerchant } from "@/lib/finance/categorization";
import type { ActionResult } from "@/lib/actions/types";
import { isAppError } from "@/lib/errors/app-error";

const registerSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  currency: z.string().length(3).default("NOK"),
});

export async function registerUser(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  try {
    await enforceActionRateLimit(registerRateLimit);

    const parsed = registerSchema.safeParse(input);
    if (!parsed.success) {
      return {
        error: {
          code: "validation_error",
          message: "Please provide a valid name, email, password and currency.",
          fieldErrors: parsed.error.flatten().fieldErrors,
        },
      };
    }
    const registerInput = parsed.data;

    const email = registerInput.email.toLowerCase();
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser) {
      return {
        error: {
          code: "conflict",
          message: "An account already exists for that email.",
        },
      };
    }

    const passwordHash = await hashPassword(registerInput.password);

    await db.transaction(async (tx) => {
      const [createdUser] = await tx
        .insert(users)
        .values({
          name: registerInput.name,
          email,
          passwordHash,
          defaultCurrency: registerInput.currency,
          onboardingComplete: true,
        })
        .returning();

      const [household] = await tx
        .insert(households)
        .values({
          name: `${registerInput.name.split(" ")[0]}'s budget`,
          defaultCurrency: registerInput.currency,
          createdById: createdUser.id,
        })
        .returning();

      await tx.insert(memberships).values({
        householdId: household.id,
        userId: createdUser.id,
        role: "owner",
      });

      // Seed category groups
      const insertedGroups = await tx
        .insert(categoryGroups)
        .values(
          defaultGroups.map((group) => ({
            householdId: household.id,
            key: group.key,
            label: group.label,
            sortOrder: group.sortOrder,
          })),
        )
        .returning();

      const groupIdByKey = new Map(
        insertedGroups.map((g) => [g.key, g.id]),
      );

      // Seed categories with group references
      const insertedCategories = await tx
        .insert(categories)
        .values(
          defaultCategories.map((category) => ({
            householdId: household.id,
            groupId: groupIdByKey.get(category.groupKey)!,
            name: category.name,
            color: category.color,
            icon: category.icon,
            isIncome: category.isIncome,
            isSystem: true,
            sortOrder: category.sortOrder,
          })),
        )
        .returning();

      const categoryIdByName = new Map(
        insertedCategories.map((c) => [c.name, c.id]),
      );

      // Seed default merchant rules
      const merchantRuleValues = defaultMerchantRules
        .filter((rule) => categoryIdByName.has(rule.category))
        .map((rule) => ({
          householdId: household.id,
          categoryId: categoryIdByName.get(rule.category)!,
          matcher: normalizeMerchant(rule.matcher),
          matcherType: rule.matcherType,
          matchField: rule.matchField,
          priority: 100,
        }));

      if (merchantRuleValues.length > 0) {
        await tx.insert(categorizationRules).values(merchantRuleValues);
      }

      const [budget] = await tx
        .insert(budgets)
        .values({
          householdId: household.id,
          name: "Main budget",
          type: "monthly",
          currency: registerInput.currency,
        })
        .returning();

      await tx.insert(budgetLines).values(
        insertedCategories
          .filter((category) => !category.isIncome)
          .map((category) => ({
            budgetId: budget.id,
            categoryId: category.id,
            allocatedAmountCents: 0,
          })),
      );
    });

    return { data: { ok: true } };
  } catch (error) {
    if (isAppError(error)) {
      return {
        error: {
          code: error.code,
          message: error.userMessage,
          fieldErrors: error.fieldErrors,
        },
      };
    }

    // Let unexpected errors bubble to the framework error boundary
    throw error;
  }
}
