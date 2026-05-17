import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { liabilities } from "@/db/schema";
import { validateJsonBody, withApiHandler } from "@/lib/errors/api";
import { getActiveHousehold } from "@/lib/finance/household";

import { createLiabilitySchema } from "@/lib/finance/validation";

export const GET = withApiHandler("liabilities.list", async () => {
  const household = await getActiveHousehold();
  const rows = await db
    .select()
    .from(liabilities)
    .where(eq(liabilities.householdId, household.householdId));

  return NextResponse.json({ liabilities: rows });
});

export const POST = withApiHandler("liabilities.create", async (request) => {
  const household = await getActiveHousehold();
  const liabilityInput = await validateJsonBody(
    request,
    createLiabilitySchema,
    "Please provide a valid liability name and balance.",
  );

  const [liability] = await db
    .insert(liabilities)
    .values({
      householdId: household.householdId,
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

  return NextResponse.json({ liability }, { status: 201 });
});
