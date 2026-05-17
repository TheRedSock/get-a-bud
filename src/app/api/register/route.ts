import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
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
import { conflictError, rateLimitedError } from "@/lib/errors/catalog";
import { validateJsonBody, withApiHandler } from "@/lib/errors/api";
import {
  defaultCategories,
  defaultGroups,
  defaultMerchantRules,
} from "@/lib/finance/defaults";
import { normalizeMerchant } from "@/lib/finance/categorization";
import { registerRateLimit } from "@/lib/security/arcjet";

const registerSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  currency: z.string().length(3).default("NOK"),
});

export const POST = withApiHandler("auth.register", async (request) => {
  const decision = await registerRateLimit.protect(request);
  if (decision.isDenied()) {
    throw rateLimitedError("Too many registration attempts. Please try again later.");
  }

  const registerInput = await validateJsonBody(
    request,
    registerSchema,
    "Please provide a valid name, email, password and currency.",
  );
  const email = registerInput.email.toLowerCase();
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingUser) {
    throw conflictError("An account already exists for that email.", { email });
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

    // Build key -> id map for group references
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

    // Build category name -> id map for merchant rules
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

  return NextResponse.json({ ok: true });
});
