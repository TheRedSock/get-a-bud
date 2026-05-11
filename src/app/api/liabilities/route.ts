import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { liabilities } from "@/db/schema";
import { getActiveHousehold } from "@/lib/finance/household";
import { createLiabilitySchema } from "@/lib/finance/validation";

export async function GET() {
  const household = await getActiveHousehold();
  const rows = await db
    .select()
    .from(liabilities)
    .where(eq(liabilities.householdId, household.householdId));

  return NextResponse.json({ liabilities: rows });
}

export async function POST(request: Request) {
  const household = await getActiveHousehold();
  const body = await request.json().catch(() => null);
  const parsed = createLiabilitySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid liability payload" },
      { status: 400 },
    );
  }

  const [liability] = await db
    .insert(liabilities)
    .values({
      householdId: household.householdId,
      name: parsed.data.name,
      kind: parsed.data.kind,
      currency: parsed.data.currency,
      currentBalance: parsed.data.currentBalance.toFixed(2),
      interestRate: parsed.data.interestRate?.toFixed(4),
      minimumPayment: parsed.data.minimumPayment?.toFixed(2),
      dueDay: parsed.data.dueDay,
      notes: parsed.data.notes,
    })
    .returning();

  return NextResponse.json({ liability }, { status: 201 });
}
