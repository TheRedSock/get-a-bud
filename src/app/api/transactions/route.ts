import { and, desc, eq, ilike } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { categories, financialAccounts, transactions } from "@/db/schema";
import { notFoundError } from "@/lib/errors/catalog";
import { validateJsonBody, withApiHandler } from "@/lib/errors/api";
import { recalculateAccountBalance } from "@/lib/finance/balance";
import { detectCategory, normalizeMerchant } from "@/lib/finance/categorization";
import { getActiveHousehold } from "@/lib/finance/household";
import { createTransactionSchema } from "@/lib/finance/validation";

export const GET = withApiHandler("transactions.list", async (request) => {
  const household = await getActiveHousehold();
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");

  const rows = await db
    .select()
    .from(transactions)
    .where(
      query
        ? and(
            eq(transactions.householdId, household.householdId),
            ilike(transactions.searchText, `%${query}%`),
          )
        : eq(transactions.householdId, household.householdId),
    )
    .orderBy(desc(transactions.date))
    .limit(100);

  return NextResponse.json({ transactions: rows });
});

export const POST = withApiHandler("transactions.create", async (request) => {
  const household = await getActiveHousehold();
  const transactionInput = await validateJsonBody(
    request,
    createTransactionSchema,
    "Please provide a valid transaction account, amount, date and description.",
  );

  const [account] = await db
    .select({
      id: financialAccounts.id,
      householdId: financialAccounts.householdId,
    })
    .from(financialAccounts)
    .where(eq(financialAccounts.id, transactionInput.accountId))
    .limit(1);

  if (!account || account.householdId !== household.householdId) {
    throw notFoundError("Choose an account from this household.", {
      accountId: transactionInput.accountId,
      householdId: household.householdId,
    });
  }

  if (transactionInput.categoryId) {
    const [cat] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.id, transactionInput.categoryId),
          eq(categories.householdId, household.householdId),
        ),
      )
      .limit(1);

    if (!cat) {
      throw notFoundError("Choose a category from this household.", {
        categoryId: transactionInput.categoryId,
        householdId: household.householdId,
      });
    }
  }

  const categoryId =
    transactionInput.categoryId ??
    (await detectCategory(
      household.householdId,
      transactionInput.description,
      transactionInput.merchantName,
    ));
  const normalizedMerchant = transactionInput.merchantName
    ? normalizeMerchant(transactionInput.merchantName)
    : normalizeMerchant(transactionInput.description);

  const [transaction] = await db
    .insert(transactions)
    .values({
      householdId: household.householdId,
      accountId: transactionInput.accountId,
      categoryId,
      amount: transactionInput.amount.toFixed(2),
      currency: transactionInput.currency,
      date: transactionInput.date,
      merchantName: transactionInput.merchantName,
      normalizedMerchantName: normalizedMerchant,
      description: transactionInput.description,
      notes: transactionInput.notes,
      searchText: `${transactionInput.description} ${
        transactionInput.merchantName ?? ""
      }`,
      source: "manual",
    })
    .returning();

  await recalculateAccountBalance(transactionInput.accountId);

  return NextResponse.json({ transaction }, { status: 201 });
});
