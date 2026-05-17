import type { PgTransaction } from "drizzle-orm/pg-core";

import {
  budgetLines,
  budgets,
  categories,
  categorizationRules,
  categoryGroups,
  households,
  memberships,
} from "@/db/schema";
import { normalizeMerchant } from "@/lib/finance/categorization";
import {
  defaultCategories,
  defaultGroups,
  defaultMerchantRules,
} from "@/lib/finance/defaults";

type OnboardingInput = {
  userId: string;
  name: string;
  currency: string;
};

/**
 * Provision a new household with default categories, categorization rules,
 * and a starter budget. Must be called within a database transaction.
 *
 * This encapsulates the tenant seeding domain logic that runs during
 * user registration.
 */
// Drizzle's PgTransaction generic parameters depend on the specific
// schema/query-builder configuration passed at the call site. There is no
// stable narrow type we can reference without coupling to the db module's
// internal generics, so `any` is accepted here as boundary glue.
export async function provisionNewHousehold(tx: PgTransaction<any, any, any>, input: OnboardingInput) {
  const [household] = await tx
    .insert(households)
    .values({
      name: `${input.name.split(" ")[0]}'s budget`,
      defaultCurrency: input.currency,
      createdById: input.userId,
    })
    .returning();

  await tx.insert(memberships).values({
    householdId: household.id,
    userId: input.userId,
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

  const groupIdByKey = new Map(insertedGroups.map((g) => [g.key, g.id]));

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

  // Seed starter budget with lines for all expense categories
  const [budget] = await tx
    .insert(budgets)
    .values({
      householdId: household.id,
      name: "Main budget",
      type: "monthly",
      currency: input.currency,
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

  return { householdId: household.id };
}
