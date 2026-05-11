import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { financialAccounts } from "@/db/schema";
import { getActiveHousehold } from "@/lib/finance/household";
import { createAccountSchema } from "@/lib/finance/validation";

export async function GET() {
  const household = await getActiveHousehold();
  const accounts = await db
    .select()
    .from(financialAccounts)
    .where(eq(financialAccounts.householdId, household.householdId));

  return NextResponse.json({ accounts });
}

export async function POST(request: Request) {
  const household = await getActiveHousehold();
  const body = await request.json().catch(() => null);
  const parsed = createAccountSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid account payload" }, { status: 400 });
  }

  const [account] = await db
    .insert(financialAccounts)
    .values({
      householdId: household.householdId,
      name: parsed.data.name,
      kind: parsed.data.kind,
      currency: parsed.data.currency,
      currentBalance: parsed.data.currentBalance.toFixed(2),
      institutionName: parsed.data.institutionName,
      isManual: true,
    })
    .returning();

  return NextResponse.json({ account }, { status: 201 });
}
