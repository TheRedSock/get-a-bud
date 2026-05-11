import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { financialAccounts } from "@/db/schema";
import { validateJsonBody, withApiHandler } from "@/lib/errors/api";
import { notFoundError } from "@/lib/errors/catalog";
import { getActiveHousehold } from "@/lib/finance/household";
import { updateAccountSchema } from "@/lib/finance/validation";

export const PATCH = withApiHandler(
  "accounts.update",
  async (
    request: Request,
    { params }: { params: Promise<{ accountId: string }> },
  ) => {
    const { accountId } = await params;
    const household = await getActiveHousehold();
    const accountInput = await validateJsonBody(
      request,
      updateAccountSchema,
      "Please provide valid account details.",
    );

    const [account] = await db
      .update(financialAccounts)
      .set({
        ...accountInput,
        institutionName:
          accountInput.institutionName === undefined
            ? undefined
            : accountInput.institutionName,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(financialAccounts.id, accountId),
          eq(financialAccounts.householdId, household.householdId),
        ),
      )
      .returning();

    if (!account) {
      throw notFoundError("Account not found.", {
        accountId,
        householdId: household.householdId,
      });
    }

    return NextResponse.json({ account });
  },
);
