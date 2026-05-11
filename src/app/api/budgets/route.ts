import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { budgets } from "@/db/schema";
import { getActiveHousehold } from "@/lib/finance/household";
import { createBudgetSchema } from "@/lib/finance/validation";

export async function GET() {
  const household = await getActiveHousehold();
  const rows = await db
    .select()
    .from(budgets)
    .where(eq(budgets.householdId, household.householdId));

  return NextResponse.json({ budgets: rows });
}

export async function POST(request: Request) {
  const household = await getActiveHousehold();
  const body = await request.json().catch(() => null);
  const parsed = createBudgetSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid budget payload" }, { status: 400 });
  }

  const [budget] = await db
    .insert(budgets)
    .values({
      householdId: household.householdId,
      name: parsed.data.name,
      type: parsed.data.type,
      currency: parsed.data.currency,
      periodStartDay: parsed.data.periodStartDay,
      paycheckAnchorDay: parsed.data.paycheckAnchorDay,
    })
    .returning();

  return NextResponse.json({ budget }, { status: 201 });
}
