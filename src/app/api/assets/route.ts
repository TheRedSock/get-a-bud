import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { assets } from "@/db/schema";
import { getActiveHousehold } from "@/lib/finance/household";
import { createAssetSchema } from "@/lib/finance/validation";

export async function GET() {
  const household = await getActiveHousehold();
  const rows = await db
    .select()
    .from(assets)
    .where(eq(assets.householdId, household.householdId));

  return NextResponse.json({ assets: rows });
}

export async function POST(request: Request) {
  const household = await getActiveHousehold();
  const body = await request.json().catch(() => null);
  const parsed = createAssetSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid asset payload" }, { status: 400 });
  }

  const [asset] = await db
    .insert(assets)
    .values({
      householdId: household.householdId,
      name: parsed.data.name,
      kind: parsed.data.kind,
      currency: parsed.data.currency,
      estimatedValue: parsed.data.estimatedValue.toFixed(2),
      valuationDate: parsed.data.valuationDate,
      notes: parsed.data.notes,
    })
    .returning();

  return NextResponse.json({ asset }, { status: 201 });
}
