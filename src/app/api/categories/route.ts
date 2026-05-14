import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { categories, categoryGroups } from "@/db/schema";
import { validateJsonBody, withApiHandler } from "@/lib/errors/api";
import { notFoundError, validationError } from "@/lib/errors/catalog";
import { getActiveHousehold } from "@/lib/finance/household";
import { createCategorySchema } from "@/lib/finance/validation";

export const GET = withApiHandler("categories.list", async () => {
  const household = await getActiveHousehold();
  const rows = await db
    .select()
    .from(categories)
    .where(eq(categories.householdId, household.householdId))
    .orderBy(asc(categories.name));

  return NextResponse.json({ categories: rows });
});

export const POST = withApiHandler("categories.create", async (request) => {
  const household = await getActiveHousehold();
  const categoryInput = await validateJsonBody(
    request,
    createCategorySchema,
    "Please provide a valid category name.",
  );

  let inheritedGroupId: string | null = null;

  // Validate groupId belongs to this household
  if (categoryInput.groupId) {
    const [group] = await db
      .select({ id: categoryGroups.id })
      .from(categoryGroups)
      .where(
        and(
          eq(categoryGroups.id, categoryInput.groupId),
          eq(categoryGroups.householdId, household.householdId),
        ),
      )
      .limit(1);

    if (!group) {
      throw notFoundError("Choose a category group from this household.", {
        groupId: categoryInput.groupId,
        householdId: household.householdId,
      });
    }
  }

  // Validate parentId belongs to this household
  if (categoryInput.parentId) {
    const [parent] = await db
      .select({ id: categories.id, groupId: categories.groupId })
      .from(categories)
      .where(
        and(
          eq(categories.id, categoryInput.parentId),
          eq(categories.householdId, household.householdId),
        ),
      )
      .limit(1);

    if (!parent) {
      throw notFoundError("Choose a parent category from this household.", {
        parentId: categoryInput.parentId,
        householdId: household.householdId,
      });
    }

    inheritedGroupId = parent.groupId;
  } else if (!categoryInput.groupId) {
    throw validationError("Choose a category group for this category.", {
      fieldErrors: {
        groupId: ["Choose a category group from this household."],
      },
      context: { householdId: household.householdId },
    });
  }

  const resolvedGroupId = inheritedGroupId ?? categoryInput.groupId;

  const [category] = await db
    .insert(categories)
    .values({
      householdId: household.householdId,
      ...categoryInput,
      groupId: resolvedGroupId!,
      isSystem: false,
    })
    .returning();

  return NextResponse.json({ category }, { status: 201 });
});
