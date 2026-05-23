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
  findBillForDetectedPattern,
  type BillScheduleIdentity,
} from "@/lib/finance/bills/consolidation";

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
      isActive: recurringBills.isActive,
      userEndedAt: recurringBills.userEndedAt,
      amountTrend: recurringBills.amountTrend,
    })
    .from(recurringBills)
    .where(
      and(
        eq(recurringBills.householdId, input.householdId),
        or(
          eq(recurringBills.isActive, true),
          and(
            eq(recurringBills.isActive, false),
            isNull(recurringBills.userEndedAt),
          ),
        ),
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

      // Try both the primary key (merchant:{id} or normalizedMerchantName) and
      // the normalizedMerchantName as fallback. Bills created before merchant
      // resolution use the name as their merchantPattern; after resolution,
      // transactions get a merchantId key. Checking both ensures matching
      // regardless of when merchant resolution ran relative to detection.
      const candidateBills =
        billsByPattern.get(patternKey) ??
        (row.merchantId && row.normalizedMerchantName
          ? billsByPattern.get(row.normalizedMerchantName)
          : undefined);
      if (!candidateBills) continue;

      for (const bill of candidateBills) {
        if (!dateMatchesBillCadence(row, bill)) continue;
        if (
          bill.amountTrend !== "volatile" &&
          bill.amountTrend !== "increasing" &&
          bill.amountTrend !== "decreasing" &&
          bill.expectedAmountCents != null
        ) {
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
      const wasAutoEnded = !bill.isActive && bill.userEndedAt == null;

      await db
        .update(recurringBills)
        .set({
          lastDetectedAt: input.runStartTime,
          lastAmountCents: Math.abs(latest.amountCents),
          expectedAmountCents:
            bill.amountTrend === "volatile"
              ? bill.expectedAmountCents
              : latestComparableAmount != null
                ? latestComparableAmount
                : bill.expectedAmountCents,
          nextDueDate,
          lastOriginalAmountCents:
            latest.originalAmountCents != null
              ? Math.abs(latest.originalAmountCents)
              : null,
          originalCurrency: latest.originalCurrency,
          ...(wasAutoEnded
            ? { isActive: true, isPossiblyCancelled: false }
            : { isPossiblyCancelled: false }),
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

function lastTxnFromResult(
  result: ReturnType<typeof detectRecurring>[number],
  txnById: Map<string, RecurringCandidateRow>,
): RecurringCandidateRow | null {
  let latest: RecurringCandidateRow | null = null;
  for (const id of result.transactionIds) {
    const txn = txnById.get(id);
    if (!txn) continue;
    if (!latest || txn.date > latest.date) latest = txn;
  }
  return latest;
}


async function mergeBillIntoTarget(
  targetBillId: string,
  siblingBillId: string,
): Promise<void> {
  // Remove sibling history rows whose transactions already exist in the target
  // to avoid violating the (billId, transactionId) unique constraint.
  const existingTargetRows = await db
    .select({ transactionId: recurringBillHistory.transactionId })
    .from(recurringBillHistory)
    .where(
      and(
        eq(recurringBillHistory.billId, targetBillId),
        isNotNull(recurringBillHistory.transactionId),
      ),
    );

  const conflictingIds = existingTargetRows
    .map((r) => r.transactionId)
    .filter((id): id is string => id != null);

  if (conflictingIds.length > 0) {
    await db
      .delete(recurringBillHistory)
      .where(
        and(
          eq(recurringBillHistory.billId, siblingBillId),
          inArray(recurringBillHistory.transactionId, conflictingIds),
        ),
      );
  }

  // Move remaining sibling history rows to the target bill
  await db
    .update(recurringBillHistory)
    .set({ billId: targetBillId })
    .where(eq(recurringBillHistory.billId, siblingBillId));

  await db.delete(recurringBills).where(eq(recurringBills.id, siblingBillId));
}

async function mergeSignatureConflicts(
  targetBillId: string,
  merchantPattern: string,
  amountSignature: string,
  householdBills: BillScheduleIdentity[],
): Promise<void> {
  const conflicts = householdBills.filter(
    (bill) =>
      bill.id !== targetBillId &&
      bill.merchantPattern === merchantPattern &&
      bill.amountSignature === amountSignature,
  );

  for (const conflict of conflicts) {
    await mergeBillIntoTarget(targetBillId, conflict.id);
    const index = householdBills.findIndex((b) => b.id === conflict.id);
    if (index >= 0) householdBills.splice(index, 1);
  }
}

function findBillByAmountSignature<T extends BillScheduleIdentity>(
  householdBills: T[],
  merchant: string,
  amountSignature: string,
): T | undefined {
  return householdBills.find(
    (bill) =>
      bill.merchantPattern === merchant &&
      bill.amountSignature === amountSignature,
  );
}

async function upsertDetectionResults(
  householdId: string,
  runStartTime: Date,
  results: ReturnType<typeof detectRecurring>,
  txnById: Map<string, RecurringCandidateRow>,
): Promise<number> {
  let historyInserted = 0;
  if (results.length === 0) return 0;

  type HouseholdBillForUpsert = BillScheduleIdentity & {
    userEndedAt: Date | null;
    nextDueDate: string | null;
    isActive: boolean;
  };

  const householdBills: HouseholdBillForUpsert[] = await db
    .select({
      id: recurringBills.id,
      merchantPattern: recurringBills.merchantPattern,
      amountSignature: recurringBills.amountSignature,
      cadence: recurringBills.cadence,
      typicalDayOfMonth: recurringBills.typicalDayOfMonth,
      isDuplicateSubscription: recurringBills.isDuplicateSubscription,
      userEndedAt: recurringBills.userEndedAt,
      nextDueDate: recurringBills.nextDueDate,
      isActive: recurringBills.isActive,
    })
    .from(recurringBills)
    .where(eq(recurringBills.householdId, householdId));

  for (const result of results) {
    const lastTxn = lastTxnFromResult(result, txnById);
    const bookAmountCents = lastTxn ? Math.abs(lastTxn.amountCents) : null;

    const existing =
      findBillForDetectedPattern(householdBills, result) ??
      findBillByAmountSignature(
        householdBills,
        result.merchant,
        result.amountSignature,
      );

    const sharedFields = {
      cadence: result.cadence,
      expectedAmountCents: bookAmountCents,
      lastAmountCents: bookAmountCents,
      amountSignature: result.amountSignature,
      detectedCadenceConfidence: result.confidence.toFixed(2),
      pattern: result.pattern,
      typicalDayOfMonth: result.typicalDayOfMonth,
      originalCurrency: lastTxn?.originalCurrency ?? result.originalCurrency,
      lastOriginalAmountCents:
        lastTxn?.originalAmountCents != null
          ? Math.abs(lastTxn.originalAmountCents)
          : result.lastOriginalAmount != null
            ? Math.abs(result.lastOriginalAmount)
            : null,
      amountTrend: result.amountTrend,
      lastDetectedAt: runStartTime,
      transactionCount: result.transactionCount,
      isDuplicateSubscription: result.isDuplicateSubscription,
      updatedAt: new Date(),
    };

    let billId: string;

    if (existing) {
      billId = existing.id;
      await mergeSignatureConflicts(
        billId,
        result.merchant,
        result.amountSignature,
        householdBills,
      );

      // Only advance nextDueDate — never regress it. Detection may see only
      // old unclaimed transactions while match already set a more recent date.
      const shouldAdvanceNextDue =
        result.predictedNextDate != null &&
        (existing.nextDueDate == null ||
          result.predictedNextDate > existing.nextDueDate);

      await db
        .update(recurringBills)
        .set({
          ...sharedFields,
          // Don't regress nextDueDate; keep the existing one if it's more recent
          nextDueDate: shouldAdvanceNextDue
            ? result.predictedNextDate
            : undefined,
          // Detection should not override isActive or isPossiblyCancelled — those
          // are managed by the match phase (reactivation on new transactions) and
          // lifecycle (ending on overdue). Detection may only see old unclaimed
          // transactions and shouldn't flip active state based on stale data.
        })
        .where(eq(recurringBills.id, existing.id));

      existing.amountSignature = result.amountSignature;
      existing.typicalDayOfMonth = result.typicalDayOfMonth;
      existing.cadence = result.cadence;
    } else {
      const preInsertConflict = findBillByAmountSignature(
        householdBills,
        result.merchant,
        result.amountSignature,
      );

      if (preInsertConflict) {
        billId = preInsertConflict.id;
        const shouldAdvanceNextDue =
          result.predictedNextDate != null &&
          (preInsertConflict.nextDueDate == null ||
            result.predictedNextDate > preInsertConflict.nextDueDate);

        await db
          .update(recurringBills)
          .set({
            ...sharedFields,
            nextDueDate: shouldAdvanceNextDue
              ? result.predictedNextDate
              : undefined,
          })
          .where(eq(recurringBills.id, preInsertConflict.id));
      } else {
        const [inserted] = await db
          .insert(recurringBills)
          .values({
            householdId,
            name: result.merchant,
            merchantPattern: result.merchant,
            ...sharedFields,
            nextDueDate: result.predictedNextDate,
            isActive: true,
            isPossiblyCancelled: false,
          })
          .returning({ id: recurringBills.id });
        if (!inserted) continue;
        billId = inserted.id;
        householdBills.push({
          id: billId,
          merchantPattern: result.merchant,
          amountSignature: result.amountSignature,
          cadence: result.cadence,
          typicalDayOfMonth: result.typicalDayOfMonth,
          isDuplicateSubscription: result.isDuplicateSubscription,
          userEndedAt: null,
          nextDueDate: result.predictedNextDate,
          isActive: true,
        });
      }
    }

    if (result.transactionIds.length === 0) continue;

    const historyRows = result.transactionIds
      .map((txnId) => {
        const txn = txnById.get(txnId);
        if (!txn) return null;
        return {
          billId,
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

    const results = detectRecurring(detectionBuffer);
    detected += results.length;
    duplicates += results.filter((r) => r.isDuplicateSubscription).length;
    priceChanges += results.filter((r) => r.priceChangeDetected).length;
    historyInserted += await upsertDetectionResults(
      input.householdId,
      input.runStartTime,
      results,
      txnById,
    );

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
