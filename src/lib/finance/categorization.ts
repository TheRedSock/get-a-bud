import { and, desc, eq, ilike } from "drizzle-orm";

import { db } from "@/db";
import { categories, categorizationRules } from "@/db/schema";

export function normalizeMerchant(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9æøå ]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function detectCategory(
  householdId: string,
  description: string,
  merchantName?: string | null,
) {
  const searchable = normalizeMerchant(`${merchantName ?? ""} ${description}`);

  const rules = await db
    .select({
      categoryId: categorizationRules.categoryId,
      matcher: categorizationRules.matcher,
    })
    .from(categorizationRules)
    .where(eq(categorizationRules.householdId, householdId))
    .orderBy(desc(categorizationRules.priority));

  const matchedRule = rules.find((rule) =>
    searchable.includes(normalizeMerchant(rule.matcher)),
  );

  if (matchedRule) {
    return matchedRule.categoryId;
  }

  const [fallback] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.householdId, householdId),
        ilike(categories.name, "%other%"),
      ),
    )
    .limit(1);

  return fallback?.id ?? null;
}

export async function learnCategoryCorrection(input: {
  householdId: string;
  categoryId: string;
  matcher: string;
  transactionId?: string;
}) {
  await db.insert(categorizationRules).values({
    householdId: input.householdId,
    categoryId: input.categoryId,
    matcher: normalizeMerchant(input.matcher),
    matcherType: "contains",
    priority: 500,
    learnedFromTransactionId: input.transactionId,
  });
}
