"use server";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { assets, liabilities } from "@/db/schema";
import {
  authenticatedAction,
  validateActionInput,
} from "@/lib/actions/safe-action";
import { validationError } from "@/lib/errors/catalog";
import {
  createAssetSchema,
  createLiabilitySchema,
} from "@/lib/finance/validation";

// ---------------------------------------------------------------------------
// createAsset
// ---------------------------------------------------------------------------

export const createAsset = authenticatedAction(
  "assets.create",
  async (ctx, input: unknown) => {
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

    return { asset };
  },
);

// ---------------------------------------------------------------------------
// createLiability
// ---------------------------------------------------------------------------

export const createLiability = authenticatedAction(
  "liabilities.create",
  async (ctx, input: unknown) => {
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

    return { liability };
  },
);
