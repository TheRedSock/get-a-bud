import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { financialAccounts, transactions } from "@/db/schema";
import { validateJsonBody, withApiHandler } from "@/lib/errors/api";
import { rateLimitedError } from "@/lib/errors/catalog";
import { getActiveHousehold } from "@/lib/finance/household";
import { createAccountSchema } from "@/lib/finance/validation";
import { authenticatedMutationRateLimit } from "@/lib/security/arcjet";

export const GET = withApiHandler("accounts.list", async () => {
  const household = await getActiveHousehold();
  const accounts = await db
    .select()
    .from(financialAccounts)
    .where(eq(financialAccounts.householdId, household.householdId));

  return NextResponse.json({ accounts });
});

export const POST = withApiHandler("accounts.create", async (request) => {
  const decision = await authenticatedMutationRateLimit.protect(request);
  if (decision.isDenied()) {
    throw rateLimitedError("Too many requests. Please try again shortly.");
  }

  const household = await getActiveHousehold();
  const accountInput = await validateJsonBody(
    request,
    createAccountSchema,
    "Please provide a valid account name, type, currency and balance.",
  );

  const openingBalance = accountInput.currentBalance;

  const account = await db.transaction(async (tx) => {
    const [createdAccount] = await tx
      .insert(financialAccounts)
      .values({
        householdId: household.householdId,
        name: accountInput.name,
        kind: accountInput.kind,
        currency: accountInput.currency,
        currentBalance: openingBalance.toFixed(2),
        institutionName: accountInput.institutionName,
        isManual: true,
      })
      .returning();

    // Model the opening balance as a transaction so that the ledger sum
    // matches `currentBalance` — consistent with the sync-side pattern.
    if (openingBalance !== 0) {
      await tx.insert(transactions).values({
        householdId: household.householdId,
        accountId: createdAccount.id,
        amount: openingBalance.toFixed(2),
        currency: accountInput.currency,
        date: new Date().toISOString().slice(0, 10),
        description: "Opening balance",
        searchText: "Opening balance",
        source: "manual",
        metadata: { isOpeningBalance: true },
      });
    }

    return createdAccount;
  });

  return NextResponse.json({ account }, { status: 201 });
});
