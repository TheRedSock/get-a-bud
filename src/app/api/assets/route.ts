import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { assets } from "@/db/schema";
import { validateJsonBody, withApiHandler } from "@/lib/errors/api";
import { getActiveHousehold } from "@/lib/finance/household";

import { createAssetSchema } from "@/lib/finance/validation";

export const GET = withApiHandler("assets.list", async () => {
  const household = await getActiveHousehold();
  const rows = await db
    .select()
    .from(assets)
    .where(eq(assets.householdId, household.householdId));

  return NextResponse.json({ assets: rows });
});

export const POST = withApiHandler("assets.create", async (request) => {
  const household = await getActiveHousehold();
  const assetInput = await validateJsonBody(
    request,
    createAssetSchema,
    "Please provide a valid asset name, value and valuation date.",
  );

  const [asset] = await db
    .insert(assets)
    .values({
      householdId: household.householdId,
      name: assetInput.name,
      kind: assetInput.kind,
      currency: assetInput.currency,
      estimatedValueCents: assetInput.estimatedValueCents,
      valuationDate: assetInput.valuationDate,
      notes: assetInput.notes,
    })
    .returning();

  return NextResponse.json({ asset }, { status: 201 });
});
