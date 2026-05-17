/**
 * Phase 2B — Enhanced recurring detection.
 *
 * Replaces the rudimentary "any merchant with 2+ transactions = monthly bill"
 * with proper cadence analysis, amount clustering, and trend tracking.
 *
 * Detection tiers:
 *   Tier 1 — Day-of-month histogram peaks (monthly / quarterly / semi-annual / yearly)
 *   Tier 2 — Weekly interval detection on unclaimed remainders
 *   Tier 3 — User-confirmed patterns (handled upstream in the inngest function)
 *
 * Public API:
 *   detectRecurring(transactions) → RecurrenceAnalysis[]
 */

import { clusterByAmount, extractPatterns } from "./analysis";
import type { RecurrenceAnalysis, RecurringTransactionInput } from "./types";

const NON_BILL_TRANSACTION_TYPES = new Set(["internal_transfer", "investment"]);

export function recurringMerchantKey(txn: RecurringTransactionInput) {
  return txn.merchantId ? `merchant:${txn.merchantId}` : txn.normalizedMerchantName;
}

/**
 * Group transactions by normalized merchant name.
 * Only includes negative amounts (expenses) with meaningful merchant names.
 */
export function groupByMerchant(
  transactions: RecurringTransactionInput[],
): Map<string, RecurringTransactionInput[]> {
  const groups = new Map<string, RecurringTransactionInput[]>();

  for (const txn of transactions) {
    if (txn.amountCents >= 0) continue;
    if (
      txn.transactionType &&
      NON_BILL_TRANSACTION_TYPES.has(txn.transactionType)
    ) {
      continue;
    }
    const key = recurringMerchantKey(txn);
    if (!key || key.length < 3) continue;

    const group = groups.get(key) ?? [];
    group.push(txn);
    groups.set(key, group);
  }

  return groups;
}

/**
 * Run the full recurring detection pipeline on a set of transactions.
 *
 * Steps:
 * 1. Group by merchant
 * 2. Sub-cluster each merchant group by amount similarity
 * 3. Extract recurring patterns from each cluster via histogram peaks
 *    and weekly interval fallback
 * 4. Return all detected recurring patterns
 *
 * Important: this function should receive only *unclaimed* transactions
 * (i.e., not already linked to an active recurring bill). The inngest
 * function handles the claimed-transaction exclusion before calling this.
 */
export function detectRecurring(
  transactions: RecurringTransactionInput[],
): RecurrenceAnalysis[] {
  const merchantGroups = groupByMerchant(transactions);
  const results: RecurrenceAnalysis[] = [];

  for (const [merchant, txns] of merchantGroups) {
    const clusters = clusterByAmount(txns);

    for (const cluster of clusters) {
      if (cluster.length < 3) continue;

      const sorted = [...cluster].sort((a, b) =>
        a.date.localeCompare(b.date),
      );

      const patterns = extractPatterns(sorted, merchant);
      results.push(...patterns);
    }
  }

  return results;
}

// Re-export types and analysis helpers for convenience
export type { RecurrenceAnalysis, RecurringTransactionInput, BillCadence } from "./types";
export {
  analyzeCluster,
  analyzeRecurrence,
  cadenceToExpectedDays,
  clusterByAmount,
  computeIntervals,
  extractPatterns,
  findDayOfMonthPeaks,
  determineCadenceFromMonthGaps,
  reconcileDelayedPayments,
  toYearMonth,
} from "./analysis";
export {
  adjustForBusinessDays,
  isNorwegianHoliday,
  norwegianHolidays,
} from "./calendar";
