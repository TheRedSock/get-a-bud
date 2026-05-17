import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { recurringBills } from "@/db/schema";
import { validateJsonBody, withApiHandler } from "@/lib/errors/api";
import { getActiveHousehold } from "@/lib/finance/household";
import { parseMoneyToCents } from "@/lib/finance/money";

const billSchema = z.object({
  name: z.string().min(1).max(120),
  merchantPattern: z.string().min(1).max(160),
  cadence: z
    .enum([
      "weekly",
      "biweekly",
      "monthly",
      "quarterly",
      "semi_annual",
      "yearly",
      "unknown",
    ])
    .default("monthly"),
  expectedAmount: z.coerce.number().optional(),
  nextDueDate: z.string().min(8).optional(),
});

export const GET = withApiHandler("bills.list", async () => {
  const household = await getActiveHousehold();
  const rows = await db
    .select()
    .from(recurringBills)
    .where(eq(recurringBills.householdId, household.householdId))
    .orderBy(asc(recurringBills.nextDueDate), asc(recurringBills.name));

  return NextResponse.json({ bills: rows });
});

export const POST = withApiHandler("bills.create", async (request) => {
  const household = await getActiveHousehold();
  const billInput = await validateJsonBody(
    request,
    billSchema,
    "Please provide a valid bill name, merchant pattern and cadence.",
  );

  const [bill] = await db
    .insert(recurringBills)
    .values({
      householdId: household.householdId,
      name: billInput.name,
      merchantPattern: billInput.merchantPattern,
      cadence: billInput.cadence,
      expectedAmountCents: billInput.expectedAmount
        ? parseMoneyToCents(billInput.expectedAmount)
        : null,
      nextDueDate: billInput.nextDueDate,
    })
    .returning();

  return NextResponse.json({ bill }, { status: 201 });
});
