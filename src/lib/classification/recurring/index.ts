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
import { validatePatternCoverage } from "./coverage";
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
 * 4. Coverage gate per pattern (reject sparse false positives)
 * 5. Flag duplicate subscriptions only when 2+ validated patterns remain
 *    in the same amount cluster
 * 6. Return all validated recurring patterns
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

      const clusterResults = extractPatterns(sorted, merchant);
      const clusterValidated = clusterResults.filter((pattern) =>
        validatePatternCoverage({
          pattern,
          allMerchantTransactions: txns,
        }),
      );

      if (clusterValidated.length === 1) {
        clusterValidated[0].isDuplicateSubscription = false;
      } else if (clusterValidated.length > 1) {
        // Only flag when multiple subscriptions share a cadence (e.g. two
        // monthly bills on the 5th and 20th). Mixed cadences in one cluster
        // are usually billing drift (month-end vs early-month), not duplicates.
        const sameCadence = clusterValidated.every(
          (pattern) => pattern.cadence === clusterValidated[0].cadence,
        );
        for (const pattern of clusterValidated) {
          pattern.isDuplicateSubscription = sameCadence;
        }
      }

      results.push(...clusterValidated);
    }
  }

  return results;
}

export type { RecurrenceAnalysis, RecurringTransactionInput, BillCadence } from "./types";
export { cadenceToExpectedDays } from "./analysis";
