import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import {
  financialAccounts,
  recurringBillHistory,
  recurringBills,
  transactions,
} from "@/db/schema";
import { withApiHandler } from "@/lib/errors/api";
import { notFoundError } from "@/lib/errors/catalog";
import { getActiveHousehold } from "@/lib/finance/household";

export const GET = withApiHandler(
  "bills.transactions",
  async (
    _request: Request,
    { params }: { params: Promise<{ billId: string }> },
  ) => {
    const { billId } = await params;
    const household = await getActiveHousehold();

    const [bill] = await db
      .select({
        id: recurringBills.id,
        householdId: recurringBills.householdId,
        cadence: recurringBills.cadence,
        pattern: recurringBills.pattern,
        typicalDayOfMonth: recurringBills.typicalDayOfMonth,
        merchantPattern: recurringBills.merchantPattern,
        amountSignature: recurringBills.amountSignature,
      })
      .from(recurringBills)
      .where(
        and(
          eq(recurringBills.id, billId),
          eq(recurringBills.householdId, household.householdId),
        ),
      )
      .limit(1);

    if (!bill) {
      throw notFoundError("Recurring bill not found.", {
        billId,
        householdId: household.householdId,
      });
    }

    const rows = await db
      .select({
        historyId: recurringBillHistory.id,
        amountCents: recurringBillHistory.amountCents,
        originalAmountCents: recurringBillHistory.originalAmountCents,
        originalCurrency: recurringBillHistory.originalCurrency,
        date: recurringBillHistory.date,
        transactionId: recurringBillHistory.transactionId,
        description: transactions.description,
        merchantName: transactions.merchantName,
        normalizedMerchantName: transactions.normalizedMerchantName,
        currency: transactions.currency,
        transactionAmountCents: transactions.amountCents,
        excludedFromBudget: transactions.excludedFromBudget,
        transactionType: transactions.transactionType,
        accountName: financialAccounts.name,
      })
      .from(recurringBillHistory)
      .leftJoin(
        transactions,
        eq(transactions.id, recurringBillHistory.transactionId),
      )
      .leftJoin(
        financialAccounts,
        eq(financialAccounts.id, transactions.accountId),
      )
      .where(eq(recurringBillHistory.billId, bill.id))
      .orderBy(desc(recurringBillHistory.date));

    return NextResponse.json({
      pattern: {
        cadence: bill.cadence,
        pattern: bill.pattern,
        typicalDayOfMonth: bill.typicalDayOfMonth,
        merchantPattern: bill.merchantPattern,
        amountSignature: bill.amountSignature,
      },
      transactions: rows,
    });
  },
);
