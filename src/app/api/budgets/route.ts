import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { budgets } from "@/db/schema";
import { validateJsonBody, withApiHandler } from "@/lib/errors/api";
import { rateLimitedError } from "@/lib/errors/catalog";
import { getActiveHousehold } from "@/lib/finance/household";
import { createBudgetSchema } from "@/lib/finance/validation";
import { authenticatedMutationRateLimit } from "@/lib/security/arcjet";

export const GET = withApiHandler("budgets.list", async () => {
  const household = await getActiveHousehold();
  const rows = await db
    .select()
    .from(budgets)
    .where(eq(budgets.householdId, household.householdId));

  return NextResponse.json({ budgets: rows });
});

export const POST = withApiHandler("budgets.create", async (request) => {
  const decision = await authenticatedMutationRateLimit.protect(request);
  if (decision.isDenied()) {
    throw rateLimitedError("Too many requests. Please try again shortly.");
  }

  const household = await getActiveHousehold();
  const budgetInput = await validateJsonBody(
    request,
    createBudgetSchema,
    "Please provide a valid budget name, type and period settings.",
  );

  const [budget] = await db
    .insert(budgets)
    .values({
      householdId: household.householdId,
      name: budgetInput.name,
      type: budgetInput.type,
      currency: budgetInput.currency,
      periodStartDay: budgetInput.periodStartDay,
      paycheckAnchorDay: budgetInput.paycheckAnchorDay,
    })
    .returning();

  return NextResponse.json({ budget }, { status: 201 });
});
