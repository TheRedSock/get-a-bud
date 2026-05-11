import { and, desc, eq, ilike, or } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { financialAccounts, transactions } from "@/db/schema";
import { detectCategory, normalizeMerchant } from "@/lib/finance/categorization";
import { getActiveHousehold } from "@/lib/finance/household";
import { createTransactionSchema } from "@/lib/finance/validation";

export async function GET(request: Request) {
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
            or(
              ilike(transactions.description, `%${query}%`),
              ilike(transactions.merchantName, `%${query}%`),
              ilike(transactions.searchText, `%${query}%`),
            ),
          )
        : eq(transactions.householdId, household.householdId),
    )
    .orderBy(desc(transactions.date))
    .limit(100);

  return NextResponse.json({ transactions: rows });
}

export async function POST(request: Request) {
  const household = await getActiveHousehold();
  const body = await request.json().catch(() => null);
  const parsed = createTransactionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid transaction payload" },
      { status: 400 },
    );
  }

  const [account] = await db
    .select({
      id: financialAccounts.id,
      householdId: financialAccounts.householdId,
    })
    .from(financialAccounts)
    .where(eq(financialAccounts.id, parsed.data.accountId))
    .limit(1);

  if (!account || account.householdId !== household.householdId) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const categoryId =
    parsed.data.categoryId ??
    (await detectCategory(
      household.householdId,
      parsed.data.description,
      parsed.data.merchantName,
    ));
  const normalizedMerchant = parsed.data.merchantName
    ? normalizeMerchant(parsed.data.merchantName)
    : normalizeMerchant(parsed.data.description);

  const [transaction] = await db
    .insert(transactions)
    .values({
      householdId: household.householdId,
      accountId: parsed.data.accountId,
      categoryId,
      amount: parsed.data.amount.toFixed(2),
      currency: parsed.data.currency,
      date: parsed.data.date,
      merchantName: parsed.data.merchantName,
      normalizedMerchantName: normalizedMerchant,
      description: parsed.data.description,
      notes: parsed.data.notes,
      searchText: `${parsed.data.description} ${parsed.data.merchantName ?? ""}`,
      source: "manual",
    })
    .returning();

  return NextResponse.json({ transaction }, { status: 201 });
}
