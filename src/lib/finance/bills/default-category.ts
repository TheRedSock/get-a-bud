import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { categories, categoryGroups } from "@/db/schema";
import { notFoundError, unexpectedError } from "@/lib/errors/catalog";

import { DEFAULT_BILL_CATEGORY_NAME } from "./constants";

export { DEFAULT_BILL_CATEGORY_NAME };

/**
 * Idempotent find-or-create for the default bill category within a household.
 * Deletable by users — recreated on next approve if missing.
 */
export async function ensureDefaultBillCategory(
  householdId: string,
): Promise<string> {
  const [existing] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.householdId, householdId),
        eq(categories.name, DEFAULT_BILL_CATEGORY_NAME),
      ),
    )
    .limit(1);

  if (existing) return existing.id;

  const [group] = await db
    .select({ id: categoryGroups.id })
    .from(categoryGroups)
    .where(eq(categoryGroups.householdId, householdId))
    .orderBy(asc(categoryGroups.sortOrder))
    .limit(1);

  if (!group) {
    throw notFoundError(
      "This household has no category groups. Add a category group in settings first.",
      { householdId },
    );
  }

  const [created] = await db
    .insert(categories)
    .values({
      householdId,
      groupId: group.id,
      name: DEFAULT_BILL_CATEGORY_NAME,
      isSystem: false,
    })
    .returning({ id: categories.id });

  if (!created) {
    throw unexpectedError("Could not create the default bill category.", {
      householdId,
    });
  }

  return created.id;
}
