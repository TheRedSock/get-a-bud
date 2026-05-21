import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  notInArray,
  or,
} from "drizzle-orm";

import { db } from "@/db";
import {
  recurringBillHistory,
  recurringBills,
  transactions,
} from "@/db/schema";
import { isTransferCandidate } from "@/lib/classification/linking";
import { detectRecurring } from "@/lib/classification/recurring";

import {
  comparableAmountForBill,
  dateMatchesBillCadence,
  isRecurringDetectionIgnored,
  nextDueDateAfterPayment,
  type RecurringCandidateRow,
} from "@/inngest/lib/recurring-job";

const EXPENSE_PAGE_SIZE = 500;

async function loadExpensePage(
  householdId: string,
  cutoffStr: string,
  offset: number,
): Promise<RecurringCandidateRow[]> {
  const page = await db
    .select({
      id: transactions.id,
      amountCents: transactions.amountCents,
      currency: transactions.currency,
      date: transactions.date,
      originalAmountCents: transactions.originalAmountCents,
      originalCurrency: transactions.originalCurrency,
      merchantId: transactions.merchantId,
      normalizedMerchantName: transactions.normalizedMerchantName,
      transactionType: transactions.transactionType,
      metadata: transactions.metadata,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, householdId),
        lt(transactions.amountCents, 0),
        gte(transactions.date, cutoffStr),
        eq(transactions.excludedFromBudget, false),
      ),
    )
    .orderBy(asc(transactions.date))
    .limit(EXPENSE_PAGE_SIZE)
    .offset(offset);

  return page.filter((row) => !isRecurringDetectionIgnored(row.metadata));
}

export async function loadClaimedTransactionIds(householdId: string) {
  const existingHistoryRows = await db
    .select({ transactionId: recurringBillHistory.transactionId })
    .from(recurringBillHistory)
    .innerJoin(
      recurringBills,
      eq(recurringBillHistory.billId, recurringBills.id),
    )
    .where(
      and(
        eq(recurringBills.householdId, householdId),
        eq(recurringBills.isActive, true),
        isNotNull(recurringBillHistory.transactionId),
      ),
    );

  return existingHistoryRows
    .map((row) => row.transactionId)
    .filter((id): id is string => id != null);
}

function merchantPatternKey(row: RecurringCandidateRow) {
  return row.merchantId
    ? `merchant:${row.merchantId}`
    : row.normalizedMerchantName;
}

export const MAX_MATCH_EXPENSE_PAGES_PER_RUN = 40;
export const MAX_DETECT_EXPENSE_PAGES_PER_RUN = 40;

export async function matchExistingRecurringBills(input: {
  householdId: string;
  cutoffStr: string;
  runStartTime: Date;
  startOffset?: number;
  maxPages?: number;
}): Promise<{
  existingMatched: number;
  claimedIds: string[];
  needsContinuation?: boolean;
  nextMatchOffset?: number;
}> {
  const existingBills = await db
    .select({
      id: recurringBills.id,
      merchantPattern: recurringBills.merchantPattern,
      typicalDayOfMonth: recurringBills.typicalDayOfMonth,
      expectedAmountCents: recurringBills.expectedAmountCents,
      originalCurrency: recurringBills.originalCurrency,
      cadence: recurringBills.cadence,
      nextDueDate: recurringBills.nextDueDate,
      pattern: recurringBills.pattern,
    })
    .from(recurringBills)
    .where(
      and(
        eq(recurringBills.householdId, input.householdId),
        eq(recurringBills.isActive, true),
      ),
    );

  const claimedIds = new Set(await loadClaimedTransactionIds(input.householdId));
  const billsByPattern = new Map<string, typeof existingBills>();

  for (const bill of existingBills) {
    const group = billsByPattern.get(bill.merchantPattern) ?? [];
    group.push(bill);
    billsByPattern.set(bill.merchantPattern, group);
  }

  let existingMatched = 0;
  let offset = input.startOffset ?? 0;
  let pagesProcessed = 0;
  const maxPages = input.maxPages ?? Number.POSITIVE_INFINITY;

  while (true) {
    const page = await loadExpensePage(
      input.householdId,
      input.cutoffStr,
      offset,
    );
    if (page.length === 0) break;
    pagesProcessed += 1;

    const matchesByBill = new Map<string, RecurringCandidateRow[]>();

    for (const row of page) {
      if (claimedIds.has(row.id)) continue;

      const patternKey = merchantPatternKey(row);
      if (!patternKey) continue;

      const candidateBills = billsByPattern.get(patternKey);
      if (!candidateBills) continue;

      for (const bill of candidateBills) {
        if (!dateMatchesBillCadence(row, bill)) continue;
        if (bill.expectedAmountCents != null) {
          const amt = comparableAmountForBill(row, bill);
          if (amt == null) continue;
          const expected = bill.expectedAmountCents;
          if (Math.abs(amt - expected) / Math.max(expected, 1) > 0.15) {
            continue;
          }
        }

        const group = matchesByBill.get(bill.id) ?? [];
        group.push(row);
        matchesByBill.set(bill.id, group);
      }
    }

    for (const [billId, newMatches] of matchesByBill) {
      const bill = existingBills.find((entry) => entry.id === billId);
      if (!bill || newMatches.length === 0) continue;

      const historyRows = newMatches.map((transaction) => ({
        billId: bill.id,
        amountCents: Math.abs(transaction.amountCents),
        originalAmountCents:
          transaction.originalAmountCents != null
            ? Math.abs(transaction.originalAmountCents)
            : null,
        originalCurrency: transaction.originalCurrency,
        date: transaction.date,
        transactionId: transaction.id,
      }));

      await db
        .insert(recurringBillHistory)
        .values(historyRows)
        .onConflictDoNothing();

      for (const match of newMatches) claimedIds.add(match.id);
      existingMatched += newMatches.length;

      const latest = newMatches.sort((a, b) => b.date.localeCompare(a.date))[0];
      const latestComparableAmount = comparableAmountForBill(latest, bill);
      const nextDueDate = nextDueDateAfterPayment(latest.date, bill);

      await db
        .update(recurringBills)
        .set({
          lastDetectedAt: input.runStartTime,
          lastAmountCents: Math.abs(latest.amountCents),
          expectedAmountCents:
            latestComparableAmount != null
              ? latestComparableAmount
              : bill.expectedAmountCents,
          nextDueDate,
          lastOriginalAmountCents:
            latest.originalAmountCents != null
              ? Math.abs(latest.originalAmountCents)
              : null,
          originalCurrency: latest.originalCurrency,
          isPossiblyCancelled: false,
          updatedAt: new Date(),
        })
        .where(eq(recurringBills.id, bill.id));
    }

    if (page.length < EXPENSE_PAGE_SIZE) break;
    offset += EXPENSE_PAGE_SIZE;

    if (pagesProcessed >= maxPages) {
      return {
        existingMatched,
        claimedIds: [...claimedIds],
        needsContinuation: true,
        nextMatchOffset: offset,
      };
    }
  }

  return { existingMatched, claimedIds: [...claimedIds] };
}

const DETECTION_BATCH_SIZE = 500;

type DetectionInput = {
  id: string;
  amountCents: number;
  currency: string;
  date: string;
  originalAmountCents: number | null;
  originalCurrency: string | null;
  merchantId: string | null;
  normalizedMerchantName: string | null;
  transactionType: string | null;
};

async function upsertDetectionResults(
  householdId: string,
  runStartTime: Date,
  results: ReturnType<typeof detectRecurring>,
  txnById: Map<string, RecurringCandidateRow>,
): Promise<number> {
  let historyInserted = 0;

  for (const result of results) {
    const lastObs = result.lastAmounts[result.lastAmounts.length - 1];
    const amountCents = lastObs ? Math.abs(Math.round(lastObs.value)) : null;

    const [bill] = await db
      .insert(recurringBills)
      .values({
        householdId,
        name: result.merchant,
        merchantPattern: result.merchant,
        amountSignature: result.amountSignature,
        cadence: result.cadence,
        expectedAmountCents: amountCents,
        nextDueDate: result.predictedNextDate,
        lastAmountCents: amountCents,
        detectedCadenceConfidence: result.confidence.toFixed(2),
        pattern: result.pattern,
        typicalDayOfMonth: result.typicalDayOfMonth,
        originalCurrency: result.originalCurrency,
        lastOriginalAmountCents:
          result.lastOriginalAmount != null
            ? Math.round(Math.abs(result.lastOriginalAmount) * 100)
            : null,
        amountTrend: result.amountTrend,
        lastDetectedAt: runStartTime,
        transactionCount: result.transactionCount,
        isDuplicateSubscription: result.isDuplicateSubscription,
        isPossiblyCancelled: false,
      })
      .onConflictDoUpdate({
        target: [
          recurringBills.householdId,
          recurringBills.merchantPattern,
          recurringBills.amountSignature,
        ],
        set: {
          cadence: result.cadence,
          expectedAmountCents: amountCents ?? undefined,
          nextDueDate: result.predictedNextDate,
          lastAmountCents: amountCents ?? undefined,
          detectedCadenceConfidence: result.confidence.toFixed(2),
          pattern: result.pattern,
          typicalDayOfMonth: result.typicalDayOfMonth,
          originalCurrency: result.originalCurrency,
          lastOriginalAmountCents:
            result.lastOriginalAmount != null
              ? Math.round(Math.abs(result.lastOriginalAmount) * 100)
              : null,
          amountTrend: result.amountTrend,
          lastDetectedAt: runStartTime,
          transactionCount: result.transactionCount,
          isDuplicateSubscription: result.isDuplicateSubscription,
          isPossiblyCancelled: false,
          isActive: true,
          updatedAt: new Date(),
        },
      })
      .returning({ id: recurringBills.id });

    if (!bill || result.transactionIds.length === 0) continue;

    const historyRows = result.transactionIds
      .map((txnId) => {
        const txn = txnById.get(txnId);
        if (!txn) return null;
        return {
          billId: bill.id,
          amountCents: Math.abs(txn.amountCents),
          originalAmountCents:
            txn.originalAmountCents != null
              ? Math.abs(txn.originalAmountCents)
              : null,
          originalCurrency: txn.originalCurrency,
          date: txn.date,
          transactionId: txnId,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    if (historyRows.length > 0) {
      const inserted = await db
        .insert(recurringBillHistory)
        .values(historyRows)
        .onConflictDoNothing()
        .returning({ id: recurringBillHistory.id });
      historyInserted += inserted.length;
    }
  }

  return historyInserted;
}

export async function detectNewRecurringBills(input: {
  householdId: string;
  cutoffStr: string;
  runStartTime: Date;
  claimedIds: string[];
  startOffset?: number;
  maxPages?: number;
}): Promise<{
  detected: number;
  historyInserted: number;
  duplicates: number;
  priceChanges: number;
  needsContinuation?: boolean;
  nextOffset?: number;
}> {
  const claimed = new Set(input.claimedIds);
  const txnById = new Map<string, RecurringCandidateRow>();
  let detectionBuffer: DetectionInput[] = [];
  let detected = 0;
  let duplicates = 0;
  let priceChanges = 0;
  let historyInserted = 0;
  const maxPages = input.maxPages ?? Number.POSITIVE_INFINITY;

  const flushDetectionBuffer = async () => {
    if (detectionBuffer.length === 0) return;
    const batchTxnById = new Map<string, RecurringCandidateRow>();
    for (const entry of detectionBuffer) {
      const row = txnById.get(entry.id);
      if (row) batchTxnById.set(entry.id, row);
    }

    const results = detectRecurring(detectionBuffer);
    detected += results.length;
    duplicates += results.filter((r) => r.isDuplicateSubscription).length;
    priceChanges += results.filter((r) => r.priceChangeDetected).length;
    historyInserted += await upsertDetectionResults(
      input.householdId,
      input.runStartTime,
      results,
      batchTxnById,
    );

    for (const entry of detectionBuffer) {
      txnById.delete(entry.id);
    }
    detectionBuffer = [];
  };

  let offset = input.startOffset ?? 0;
  let pagesProcessed = 0;

  while (true) {
    const page = await loadExpensePage(
      input.householdId,
      input.cutoffStr,
      offset,
    );
    if (page.length === 0) break;
    pagesProcessed += 1;

    for (const row of page) {
      if (claimed.has(row.id) || isTransferCandidate(row.transactionType)) {
        continue;
      }
      txnById.set(row.id, row);
      detectionBuffer.push({
        id: row.id,
        amountCents: row.amountCents,
        currency: row.currency,
        date: row.date,
        originalAmountCents: row.originalAmountCents ?? null,
        originalCurrency: row.originalCurrency,
        merchantId: row.merchantId,
        normalizedMerchantName: row.normalizedMerchantName,
        transactionType: row.transactionType,
      });
      if (detectionBuffer.length >= DETECTION_BATCH_SIZE) {
        await flushDetectionBuffer();
      }
    }

    if (page.length < EXPENSE_PAGE_SIZE) break;
    offset += EXPENSE_PAGE_SIZE;

    if (pagesProcessed >= maxPages) {
      await flushDetectionBuffer();
      return {
        detected,
        historyInserted,
        duplicates,
        priceChanges,
        needsContinuation: true,
        nextOffset: offset,
      };
    }
  }

  await flushDetectionBuffer();

  return { detected, historyInserted, duplicates, priceChanges };
}

export async function cleanupStaleRecurringBills(householdId: string) {
  const activeBills = await db
    .select({
      id: recurringBills.id,
      categoryId: recurringBills.categoryId,
    })
    .from(recurringBills)
    .where(
      and(
        eq(recurringBills.householdId, householdId),
        eq(recurringBills.isActive, true),
      ),
    );

  const historyBills = await db
    .select({ billId: recurringBillHistory.billId })
    .from(recurringBillHistory)
    .innerJoin(recurringBills, eq(recurringBillHistory.billId, recurringBills.id))
    .where(eq(recurringBills.householdId, householdId));

  const eligibleHistoryBills = await db
    .select({ billId: recurringBillHistory.billId })
    .from(recurringBillHistory)
    .innerJoin(transactions, eq(recurringBillHistory.transactionId, transactions.id))
    .innerJoin(recurringBills, eq(recurringBillHistory.billId, recurringBills.id))
    .where(
      and(
        eq(recurringBills.householdId, householdId),
        lt(transactions.amountCents, 0),
        eq(transactions.excludedFromBudget, false),
        or(
          isNull(transactions.transactionType),
          notInArray(transactions.transactionType, [
            "internal_transfer",
            "investment",
          ]),
        ),
      ),
    );

  const billsWithHistory = new Set(historyBills.map((row) => row.billId));
  const billsWithEligibleHistory = new Set(
    eligibleHistoryBills.map((row) => row.billId),
  );
  const staleBills = activeBills.filter(
    (bill) =>
      billsWithHistory.has(bill.id) && !billsWithEligibleHistory.has(bill.id),
  );
  const unapprovedIds = staleBills
    .filter((bill) => bill.categoryId == null)
    .map((bill) => bill.id);
  const approvedIds = staleBills
    .filter((bill) => bill.categoryId != null)
    .map((bill) => bill.id);

  let deleted = 0;
  let markedForReview = 0;

  if (unapprovedIds.length > 0) {
    const deletedRows = await db
      .delete(recurringBills)
      .where(inArray(recurringBills.id, unapprovedIds))
      .returning({ id: recurringBills.id });
    deleted = deletedRows.length;
  }

  if (approvedIds.length > 0) {
    const updatedRows = await db
      .update(recurringBills)
      .set({
        isPossiblyCancelled: true,
        updatedAt: new Date(),
      })
      .where(inArray(recurringBills.id, approvedIds))
      .returning({ id: recurringBills.id });
    markedForReview = updatedRows.length;
  }

  return { deleted, markedForReview };
}
