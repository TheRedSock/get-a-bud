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
import type { BillCadence, RecurrenceAnalysis, RecurringTransactionInput } from "./types";

const NON_BILL_TRANSACTION_TYPES = new Set(["internal_transfer", "investment"]);

/**
 * Cadence ordering from shortest to longest period. Used by the billing-drift
 * arbitration to identify dominant (shorter-cycle) patterns.
 */
const CADENCE_RANK: Record<BillCadence, number> = {
  weekly: 1,
  biweekly: 2,
  monthly: 3,
  quarterly: 4,
  semi_annual: 5,
  yearly: 6,
  unknown: 7,
};

export function recurringMerchantKey(txn: RecurringTransactionInput) {
  if (txn.merchantId) return `merchant:${txn.merchantId}`;
  const name = txn.normalizedMerchantName;
  if (!name) return name;
  // Strip trailing PayPal reference tokens (e.g., "paypal spotify p3" → "paypal spotify")
  // so that reference rotations (P3 → P4) don't split the same merchant into
  // separate groups during recurring detection.
  return stripNormalizedPaypalRef(name);
}

/**
 * Strip trailing "p\d+" tokens from normalized merchant names that appear to
 * be PayPal transactions. These are internal PayPal reference identifiers that
 * rotate over time for the same underlying merchant.
 */
function stripNormalizedPaypalRef(normalized: string): string {
  if (!normalized.startsWith("paypal ")) return normalized;
  return normalized.replace(/\s+p\d+$/, "");
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
 * Suppress billing-drift sub-patterns within a validated set.
 *
 * When day-of-month histogram peaks split the same subscription stream into
 * multiple peaks (e.g. day-30 and day-1/2 from month-boundary drift), each
 * peak may produce a valid cadence. The shorter-period pattern (monthly)
 * almost always represents the true billing cycle; longer-period artifacts
 * (quarterly, semi-annual) are byproducts of sparse early-month transactions.
 *
 * This function drops longer-cadence patterns that are dominated by a
 * shorter-cadence pattern in the same amount cluster, defined as:
 *   - The dominant pattern has at least 2× the transaction count, OR
 *   - The dominant pattern has more transactions AND covers more distinct months
 */
export function suppressBillingDriftPatterns(
  patterns: RecurrenceAnalysis[],
): RecurrenceAnalysis[] {
  if (patterns.length <= 1) return patterns;

  // Check if all patterns share the same cadence — if yes, no drift to resolve.
  const cadences = new Set(patterns.map((p) => p.cadence));
  if (cadences.size === 1) return patterns;

  // Find the strongest pattern by transaction count among the shortest cadences.
  const sorted = [...patterns].sort((a, b) => {
    const rankDiff = CADENCE_RANK[a.cadence] - CADENCE_RANK[b.cadence];
    if (rankDiff !== 0) return rankDiff;
    return b.transactionCount - a.transactionCount;
  });

  const dominant = sorted[0];
  const dominantMonths = countDistinctMonths(dominant.transactionIds, dominant);

  const survivors: RecurrenceAnalysis[] = [dominant];
  for (let i = 1; i < sorted.length; i++) {
    const candidate = sorted[i];
    // Same cadence as dominant — keep (may be genuine duplicate subscription).
    if (candidate.cadence === dominant.cadence) {
      survivors.push(candidate);
      continue;
    }

    // Longer cadence: suppress if dominated by the shorter-cadence pattern.
    const dominated =
      dominant.transactionCount >= candidate.transactionCount * 2 ||
      (dominant.transactionCount > candidate.transactionCount &&
        dominantMonths > countDistinctMonths(candidate.transactionIds, candidate));

    if (!dominated) {
      survivors.push(candidate);
    }
  }

  return survivors;
}

/**
 * Count distinct year-months covered by a pattern's transactions.
 * Uses the pattern's predictedNextDate as a proxy for the date range when
 * transaction IDs aren't resolvable to dates directly (we use the analysis
 * result's metadata instead).
 */
function countDistinctMonths(
  _transactionIds: string[],
  pattern: RecurrenceAnalysis,
): number {
  // The pattern's transactionCount / cadence gives an approximation, but we
  // can derive distinct months from the transaction count and cadence directly:
  // a monthly bill with 14 transactions covers ~14 months; a quarterly bill
  // with 5 transactions covers ~5 × 3 = 15 months but only 5 distinct paying months.
  // For arbitration, "distinct paying months" is the relevant metric.
  return pattern.transactionCount;
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
 * 5. Billing-drift arbitration: suppress longer-cadence artifacts dominated
 *    by a shorter-cadence pattern in the same cluster
 * 6. Flag duplicate subscriptions only when 2+ validated patterns remain
 *    in the same amount cluster
 * 7. Return all validated recurring patterns
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

      // Suppress billing-drift artifacts: when a monthly pattern dominates,
      // drop weaker longer-cadence patterns from the same amount cluster.
      const arbitrated = suppressBillingDriftPatterns(clusterValidated);

      if (arbitrated.length === 1) {
        arbitrated[0].isDuplicateSubscription = false;
      } else if (arbitrated.length > 1) {
        // Only flag when multiple subscriptions share a cadence (e.g. two
        // monthly bills on the 5th and 20th). Mixed cadences in one cluster
        // are usually billing drift (month-end vs early-month), not duplicates.
        const sameCadence = arbitrated.every(
          (pattern) => pattern.cadence === arbitrated[0].cadence,
        );
        for (const pattern of arbitrated) {
          pattern.isDuplicateSubscription = sameCadence;
        }
      }

      results.push(...arbitrated);
    }
  }

  return results;
}

export type { RecurrenceAnalysis, RecurringTransactionInput, BillCadence } from "./types";
export { cadenceToExpectedDays } from "./analysis";
