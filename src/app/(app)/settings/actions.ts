"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { categories, categoryGroups } from "@/db/schema";
import {
  authenticatedAction,
  validateActionInput,
} from "@/lib/actions/safe-action";
import { AuditAction, writeAuditEvent } from "@/lib/audit";
import { forbiddenError, notFoundError, validationError } from "@/lib/errors/catalog";
import { createCategorySchema } from "@/lib/finance/validation";
import {
  authenticatedMutationRateLimit,
  enforceActionRateLimit,
} from "@/lib/security/arcjet";

// ---------------------------------------------------------------------------
// Envelope schemas
// ---------------------------------------------------------------------------

const categoryIdEnvelope = z.object({
  categoryId: z.string().min(1),
});

const categoryUpdateEnvelope = z.object({
  categoryId: z.string().min(1),
  data: z.unknown(),
});

const updateCategorySchema = z.object({
  name: z.string().min(1).max(80).optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  isIncome: z.coerce.boolean().optional(),
  groupId: z.string().min(1).optional(),
  parentId: z.string().min(1).nullable().optional(),
});

// ---------------------------------------------------------------------------
// createCategory
// ---------------------------------------------------------------------------

export const createCategory = authenticatedAction(
  "categories.create",
  async (ctx, input: unknown) => {
    await enforceActionRateLimit(authenticatedMutationRateLimit, ctx.user.id);

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

    await writeAuditEvent({
      householdId: ctx.householdId,
      actorUserId: ctx.user.id,
      action: AuditAction.CATEGORY_CREATE,
      resourceType: "category",
      resourceId: category.id,
      outcome: "success",
    });

    return { category };
  },
);

// ---------------------------------------------------------------------------
// updateCategory
// ---------------------------------------------------------------------------

export const updateCategory = authenticatedAction(
  "categories.update",
  async (ctx, input: unknown) => {
    await enforceActionRateLimit(authenticatedMutationRateLimit, ctx.user.id);

    const envelope = validateActionInput(
      categoryUpdateEnvelope,
      input,
      "Please provide a valid category ID.",
    );
    if (envelope.error) throw validationError(envelope.error.message, { fieldErrors: envelope.error.fieldErrors });
    const { categoryId, data } = envelope.data;

    const validated = validateActionInput(
      updateCategorySchema,
      data,
      "Please provide valid category details.",
    );
    if (validated.error) throw validationError(validated.error.message, { fieldErrors: validated.error.fieldErrors });
    const categoryInput = validated.data;

    // Validate groupId if changing
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

    // Validate parentId if changing
    if (categoryInput.parentId) {
      const [parent] = await db
        .select({ id: categories.id })
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
    }

    const [category] = await db
      .update(categories)
      .set(categoryInput)
      .where(
        and(
          eq(categories.id, categoryId),
          eq(categories.householdId, ctx.householdId),
        ),
      )
      .returning();

    if (!category) {
      throw notFoundError("Category not found.", {
        categoryId,
        householdId: ctx.householdId,
      });
    }

    await writeAuditEvent({
      householdId: ctx.householdId,
      actorUserId: ctx.user.id,
      action: AuditAction.CATEGORY_UPDATE,
      resourceType: "category",
      resourceId: categoryId,
      outcome: "success",
    });

    return { category };
  },
);

// ---------------------------------------------------------------------------
// deleteCategory
// ---------------------------------------------------------------------------

export const deleteCategory = authenticatedAction(
  "categories.delete",
  async (ctx, input: unknown) => {
    await enforceActionRateLimit(authenticatedMutationRateLimit, ctx.user.id);

    const envelope = validateActionInput(
      categoryIdEnvelope,
      input,
      "Please provide a valid category ID.",
    );
    if (envelope.error) throw validationError(envelope.error.message, { fieldErrors: envelope.error.fieldErrors });
    const { categoryId } = envelope.data;

    // System categories cannot be deleted
    const [existing] = await db
      .select({ id: categories.id, isSystem: categories.isSystem })
      .from(categories)
      .where(
        and(
          eq(categories.id, categoryId),
          eq(categories.householdId, ctx.householdId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw notFoundError("Category not found.", {
        categoryId,
        householdId: ctx.householdId,
      });
    }

    if (existing.isSystem) {
      throw forbiddenError("System categories cannot be deleted.");
    }

    await db
      .delete(categories)
      .where(
        and(
          eq(categories.id, categoryId),
          eq(categories.householdId, ctx.householdId),
        ),
      );

    await writeAuditEvent({
      householdId: ctx.householdId,
      actorUserId: ctx.user.id,
      action: AuditAction.CATEGORY_DELETE,
      resourceType: "category",
      resourceId: categoryId,
      outcome: "success",
    });

    return { deleted: true };
  },
);
