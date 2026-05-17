"use server";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { categories, categoryGroups } from "@/db/schema";
import {
  authenticatedAction,
  validateActionInput,
} from "@/lib/actions/safe-action";
import { notFoundError, validationError } from "@/lib/errors/catalog";
import { createCategorySchema } from "@/lib/finance/validation";

// ---------------------------------------------------------------------------
// createCategory
// ---------------------------------------------------------------------------

export const createCategory = authenticatedAction(
  "categories.create",
  async (ctx, input: unknown) => {
    const validated = validateActionInput(
      createCategorySchema,
      input,
      "Please provide a valid category name.",
    );
    if (validated.error) throw validationError(validated.error.message, { fieldErrors: validated.error.fieldErrors });
    const categoryInput = validated.data;

    let inheritedGroupId: string | null = null;

    // Validate groupId belongs to this household
    if (categoryInput.groupId) {
      const [group] = await db
        .select({ id: categoryGroups.id })
        .from(categoryGroups)
        .where(
          and(
            eq(categoryGroups.id, categoryInput.groupId),
            eq(categoryGroups.householdId, ctx.householdId),
          ),
        )
        .limit(1);

      if (!group) {
        throw notFoundError("Choose a category group from this household.", {
          groupId: categoryInput.groupId,
          householdId: ctx.householdId,
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
            eq(categories.householdId, ctx.householdId),
          ),
        )
        .limit(1);

      if (!parent) {
        throw notFoundError("Choose a parent category from this household.", {
          parentId: categoryInput.parentId,
          householdId: ctx.householdId,
        });
      }

      inheritedGroupId = parent.groupId;
    } else if (!categoryInput.groupId) {
      throw validationError("Choose a category group for this category.", {
        fieldErrors: {
          groupId: ["Choose a category group from this household."],
        },
      });
    }

    const resolvedGroupId = inheritedGroupId ?? categoryInput.groupId;

    const [category] = await db
      .insert(categories)
      .values({
        householdId: ctx.householdId,
        ...categoryInput,
        groupId: resolvedGroupId!,
        isSystem: false,
      })
      .returning();

    return { category };
  },
);
