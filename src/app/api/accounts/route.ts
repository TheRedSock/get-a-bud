import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { financialAccounts } from "@/db/schema";
import { validateJsonBody, withApiHandler } from "@/lib/errors/api";
import { getActiveHousehold } from "@/lib/finance/household";
import { createAccountSchema } from "@/lib/finance/validation";

export const GET = withApiHandler("accounts.list", async () => {
  const household = await getActiveHousehold();
  const accounts = await db
    .select()
    .from(financialAccounts)
    .where(eq(financialAccounts.householdId, household.householdId));

  return NextResponse.json({ accounts });
});

export const POST = withApiHandler("accounts.create", async (request) => {
  const household = await getActiveHousehold();
  const accountInput = await validateJsonBody(
    request,
    createAccountSchema,
    "Please provide a valid account name, type, currency and balance.",
  );

  const [account] = await db
    .insert(financialAccounts)
    .values({
      householdId: household.householdId,
      name: accountInput.name,
      kind: accountInput.kind,
      currency: accountInput.currency,
      currentBalance: accountInput.currentBalance.toFixed(2),
      institutionName: accountInput.institutionName,
      isManual: true,
    })
    .returning();

  return NextResponse.json({ account }, { status: 201 });
});
