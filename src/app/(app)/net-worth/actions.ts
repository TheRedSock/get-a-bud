"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { assets, liabilities } from "@/db/schema";
import {
  authenticatedAction,
  validateActionInput,
} from "@/lib/actions/safe-action";
import { AuditAction, writeAuditEvent } from "@/lib/audit";
import { notFoundError, validationError } from "@/lib/errors/catalog";
import { moneyPreprocessor } from "@/lib/finance/money";
import {
  createAssetSchema,
  createLiabilitySchema,
} from "@/lib/finance/validation";
import {
  authenticatedMutationRateLimit,
  enforceActionRateLimit,
} from "@/lib/security/arcjet";

// ---------------------------------------------------------------------------
// Envelope schemas
// ---------------------------------------------------------------------------

const assetUpdateEnvelope = z.object({
  assetId: z.string().min(1),
  data: z.unknown(),
});

const liabilityUpdateEnvelope = z.object({
  liabilityId: z.string().min(1),
  data: z.unknown(),
});

const updateAssetSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  kind: z.string().min(1).max(80).optional(),
  currency: z.string().trim().toUpperCase().length(3).optional(),
  estimatedValueCents: z.preprocess(moneyPreprocessor, z.number().int().nonnegative()).optional(),
  valuationDate: z.string().min(8).optional(),
  notes: z.string().max(1000).nullable().optional(),
});

const updateLiabilitySchema = z.object({
  name: z.string().min(1).max(120).optional(),
  kind: z.string().min(1).max(80).optional(),
  currency: z.string().trim().toUpperCase().length(3).optional(),
  currentBalanceCents: z.preprocess(moneyPreprocessor, z.number().int().nonnegative()).optional(),
  interestRate: z.coerce.number().optional(),
  minimumPaymentCents: z.preprocess(moneyPreprocessor, z.number().int().optional()).optional(),
  dueDay: z.coerce.number().int().min(1).max(31).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

// ---------------------------------------------------------------------------
// createAsset
// ---------------------------------------------------------------------------

export const createAsset = authenticatedAction(
  "assets.create",
  async (ctx, input: unknown) => {
    await enforceActionRateLimit(authenticatedMutationRateLimit, ctx.user.id);

    const validated = validateActionInput(
      createAssetSchema,
      input,
      "Please provide a valid asset name, value and valuation date.",
    );
    if (validated.error) throw validationError(validated.error.message, { fieldErrors: validated.error.fieldErrors });
    const assetInput = validated.data;

    const [asset] = await db
      .insert(assets)
      .values({
        householdId: ctx.householdId,
        name: assetInput.name,
        kind: assetInput.kind,
        currency: assetInput.currency,
        estimatedValueCents: assetInput.estimatedValueCents,
        valuationDate: assetInput.valuationDate,
        notes: assetInput.notes,
      })
      .returning();

    await writeAuditEvent({
      householdId: ctx.householdId,
      actorUserId: ctx.user.id,
      action: AuditAction.ASSET_CREATE,
      resourceType: "asset",
      resourceId: asset.id,
      outcome: "success",
    });

    return { asset };
  },
);

// ---------------------------------------------------------------------------
// createLiability
// ---------------------------------------------------------------------------

export const createLiability = authenticatedAction(
  "liabilities.create",
  async (ctx, input: unknown) => {
    await enforceActionRateLimit(authenticatedMutationRateLimit, ctx.user.id);

    const validated = validateActionInput(
      createLiabilitySchema,
      input,
      "Please provide a valid liability name and balance.",
    );
    if (validated.error) throw validationError(validated.error.message, { fieldErrors: validated.error.fieldErrors });
    const liabilityInput = validated.data;

    const [liability] = await db
      .insert(liabilities)
      .values({
        householdId: ctx.householdId,
        name: liabilityInput.name,
        kind: liabilityInput.kind,
        currency: liabilityInput.currency,
        currentBalanceCents: liabilityInput.currentBalanceCents,
        interestRate: liabilityInput.interestRate?.toFixed(4),
        minimumPaymentCents: liabilityInput.minimumPaymentCents ?? null,
        dueDay: liabilityInput.dueDay,
        notes: liabilityInput.notes,
      })
      .returning();

    await writeAuditEvent({
      householdId: ctx.householdId,
      actorUserId: ctx.user.id,
      action: AuditAction.LIABILITY_CREATE,
      resourceType: "liability",
      resourceId: liability.id,
      outcome: "success",
    });

    return { liability };
  },
);

// ---------------------------------------------------------------------------
// updateAsset
// ---------------------------------------------------------------------------

export const updateAsset = authenticatedAction(
  "assets.update",
  async (ctx, input: unknown) => {
    await enforceActionRateLimit(authenticatedMutationRateLimit, ctx.user.id);

    const envelope = validateActionInput(
      assetUpdateEnvelope,
      input,
      "Please provide a valid asset ID.",
    );
    if (envelope.error) throw validationError(envelope.error.message, { fieldErrors: envelope.error.fieldErrors });
    const { assetId, data } = envelope.data;

    const validated = validateActionInput(
      updateAssetSchema,
      data,
      "Please provide valid asset details.",
    );
    if (validated.error) throw validationError(validated.error.message, { fieldErrors: validated.error.fieldErrors });
    const assetInput = validated.data;

    const [asset] = await db
      .update(assets)
      .set({
        ...assetInput,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(assets.id, assetId),
          eq(assets.householdId, ctx.householdId),
        ),
      )
      .returning();

    if (!asset) {
      throw notFoundError("Asset not found.", {
        assetId,
        householdId: ctx.householdId,
      });
    }

    await writeAuditEvent({
      householdId: ctx.householdId,
      actorUserId: ctx.user.id,
      action: AuditAction.ASSET_UPDATE,
      resourceType: "asset",
      resourceId: assetId,
      outcome: "success",
    });

    return { asset };
  },
);

// ---------------------------------------------------------------------------
// updateLiability
// ---------------------------------------------------------------------------

export const updateLiability = authenticatedAction(
  "liabilities.update",
  async (ctx, input: unknown) => {
    await enforceActionRateLimit(authenticatedMutationRateLimit, ctx.user.id);

    const envelope = validateActionInput(
      liabilityUpdateEnvelope,
      input,
      "Please provide a valid liability ID.",
    );
    if (envelope.error) throw validationError(envelope.error.message, { fieldErrors: envelope.error.fieldErrors });
    const { liabilityId, data } = envelope.data;

    const validated = validateActionInput(
      updateLiabilitySchema,
      data,
      "Please provide valid liability details.",
    );
    if (validated.error) throw validationError(validated.error.message, { fieldErrors: validated.error.fieldErrors });
    const liabilityInput = validated.data;

    const [liability] = await db
      .update(liabilities)
      .set({
        ...liabilityInput,
        interestRate: liabilityInput.interestRate?.toFixed(4),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(liabilities.id, liabilityId),
          eq(liabilities.householdId, ctx.householdId),
        ),
      )
      .returning();

    if (!liability) {
      throw notFoundError("Liability not found.", {
        liabilityId,
        householdId: ctx.householdId,
      });
    }

    await writeAuditEvent({
      householdId: ctx.householdId,
      actorUserId: ctx.user.id,
      action: AuditAction.LIABILITY_UPDATE,
      resourceType: "liability",
      resourceId: liabilityId,
      outcome: "success",
    });

    return { liability };
  },
);
