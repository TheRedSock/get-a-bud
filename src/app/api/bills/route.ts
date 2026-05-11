import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { recurringBills } from "@/db/schema";
import { getActiveHousehold } from "@/lib/finance/household";

const billSchema = z.object({
  name: z.string().min(1).max(120),
  merchantPattern: z.string().min(1).max(160),
  cadence: z
    .enum(["weekly", "biweekly", "monthly", "quarterly", "yearly", "unknown"])
    .default("monthly"),
  expectedAmount: z.coerce.number().optional(),
  nextDueDate: z.string().min(8).optional(),
});

export async function GET() {
  const household = await getActiveHousehold();
  const rows = await db
    .select()
    .from(recurringBills)
    .where(eq(recurringBills.householdId, household.householdId))
    .orderBy(asc(recurringBills.nextDueDate));

  return NextResponse.json({ bills: rows });
}

export async function POST(request: Request) {
  const household = await getActiveHousehold();
  const body = await request.json().catch(() => null);
  const parsed = billSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid bill payload" }, { status: 400 });
  }

  const [bill] = await db
    .insert(recurringBills)
    .values({
      householdId: household.householdId,
      name: parsed.data.name,
      merchantPattern: parsed.data.merchantPattern,
      cadence: parsed.data.cadence,
      expectedAmount: parsed.data.expectedAmount?.toFixed(2),
      nextDueDate: parsed.data.nextDueDate,
    })
    .returning();

  return NextResponse.json({ bill }, { status: 201 });
}
