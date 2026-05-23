/**
 * Phase 2B — Recurring detection analysis functions.
 *
 * Provides: amount clustering, interval computation, cadence detection,
 * regularity scoring, trend analysis, and recurrence determination.
 */

import { addDays, adjustForBusinessDays, nextCadenceDate } from "./calendar";
import type {
  AmountObservation,
  AmountTrend,
  BillCadence,
  RecurrenceAnalysis,
  RecurrencePattern,
  RecurringTransactionInput,
} from "./types";

// ---------------------------------------------------------------------------
// Statistical helpers
// ---------------------------------------------------------------------------

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance =
    values.reduce((s, v) => s + (v - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function coefficientOfVariation(values: number[]): number {
  const avg = mean(values);
  if (avg === 0) return 0;
  return standardDeviation(values) / Math.abs(avg);
}

/**
 * Return the most common value (mode). On ties, return the first seen.
 */
export function mode(values: number[]): number {
  const counts = new Map<number, number>();
  for (const v of values) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best = values[0];
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      bestCount = c;
      best = v;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Amount clustering
// ---------------------------------------------------------------------------

/**
 * Get the comparable amount for a transaction (absolute cents), preferring
 * original currency.
 */
function getComparableAmount(t: RecurringTransactionInput): number {
  return t.originalAmountCents !== null
    ? Math.abs(t.originalAmountCents)
    : Math.abs(t.amountCents);
}

/**
 * Get the comparable currency for a transaction.
 */
function getComparableCurrency(t: RecurringTransactionInput): string {
  return t.originalCurrency ?? t.currency;
}

/**
 * Cluster transactions by amount similarity (within 15% and same currency).
 *
 * This separates, e.g., Netflix subscriptions (EUR 21.99 monthly) from a
 * one-off Netflix gift card (EUR 50.00), and daily 50 NOK coffees from a
 * monthly 500 NOK gift card reload at the same merchant.
 */
export function clusterByAmount(
  txns: RecurringTransactionInput[],
): RecurringTransactionInput[][] {
  if (txns.length === 0) return [];

  // Assign in date order against each cluster's median amount so a gradual
  // price change (e.g. HOA fee increase) stays in one cluster. Sorting by
  // amount alone splits those into separate clusters when a one-off outlier
  // sits between two similar amounts in the sorted list.
  const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date));
  const clusters: RecurringTransactionInput[][] = [];

  for (const txn of sorted) {
    const amt = getComparableAmount(txn);
    const cur = getComparableCurrency(txn);

    let placed = false;
    for (const cluster of clusters) {
      const clusterCur = getComparableCurrency(cluster[0]);
      if (clusterCur !== cur) continue;

      const clusterMedian = median(cluster.map(getComparableAmount));
      const withinRange =
        Math.abs(amt - clusterMedian) / Math.max(clusterMedian, 0.01) <= 0.15;

      if (withinRange) {
        cluster.push(txn);
        placed = true;
        break;
      }
    }

    if (!placed) {
      clusters.push([txn]);
    }
  }

  return clusters;
}

// ---------------------------------------------------------------------------
// Interval computation
// ---------------------------------------------------------------------------

/**
 * Compute day intervals between consecutive transactions sorted by date.
 */
export function computeIntervals(
  sorted: RecurringTransactionInput[],
): number[] {
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1].date);
    const curr = new Date(sorted[i].date);
    const days = Math.round(
      (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24),
    );
    intervals.push(days);
  }
  return intervals;
}

// ---------------------------------------------------------------------------
// Cadence detection
// ---------------------------------------------------------------------------

/**
 * Map a median interval (in days) to a cadence label.
 * Returns null if the interval doesn't match any known cadence.
 */
export function mapToCadence(medianInterval: number): BillCadence | null {
  if (medianInterval >= 6 && medianInterval <= 8) return "weekly";
  if (medianInterval >= 12 && medianInterval <= 16) return "biweekly";
  if (medianInterval >= 26 && medianInterval <= 35) return "monthly";
  if (medianInterval >= 55 && medianInterval <= 95) return "quarterly";
  if (medianInterval >= 170 && medianInterval <= 200) return "semi_annual";
  if (medianInterval >= 340 && medianInterval <= 395) return "yearly";
  return null;
}

/**
 * Expected interval in days for a cadence.
 */
export function cadenceToExpectedDays(cadence: BillCadence): number {
  switch (cadence) {
    case "weekly":
      return 7;
    case "biweekly":
      return 14;
    case "monthly":
      return 30;
    case "quarterly":
      return 91;
    case "semi_annual":
      return 182;
    case "yearly":
      return 365;
    default:
      return 30;
  }
}

// ---------------------------------------------------------------------------
// Amount trend analysis
// ---------------------------------------------------------------------------

/**
 * Detect the trend in a sequence of amounts.
 */
export function detectTrend(amounts: AmountObservation[]): AmountTrend {
  if (amounts.length < 3) return "stable";

  const values = amounts.map((a) => a.value);
  const cov = coefficientOfVariation(values);

  if (cov > 0.3) return "volatile";

  // Simple linear regression to detect direction
  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumX2 = 0;
  const n = values.length;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const avgValue = sumY / n;

  // If slope is more than 2% of the average per period, it's trending
  const slopeRatio = Math.abs(slope) / avgValue;
  if (slopeRatio < 0.02) return "stable";
  return slope > 0 ? "increasing" : "decreasing";
}

// ---------------------------------------------------------------------------
// Amount signature
// ---------------------------------------------------------------------------

/**
 * Compute a stable signature that disambiguates different recurring
 * patterns for the same merchant. Format: "{currency}~{roundedMedian}".
 *
 * Two identical Netflix subs (same amount + currency) will share a
 * signature, which is fine — interleave detection splits them.
 */
function computeAmountSignature(
  amounts: AmountObservation[],
): string {
  if (amounts.length === 0) return "";
  const currency = amounts[amounts.length - 1].currency;
  const values = amounts.map((a) => a.value);
  const med = median(values);
  return `${currency}~${Math.round(med)}`;
}

// ---------------------------------------------------------------------------
// Core recurrence analysis
// ---------------------------------------------------------------------------

/**
 * Analyze a cluster of amount-similar transactions from one merchant
 * to determine if they represent a recurring bill.
 *
 * Transactions must be pre-sorted by date ascending.
 */
export function analyzeRecurrence(
  sorted: RecurringTransactionInput[],
  merchant: string,
): RecurrenceAnalysis {
  const noResult: RecurrenceAnalysis = {
    isRecurring: false,
    merchant,
    cadence: "unknown",
    confidence: 0,
    pattern: "irregular",
    predictedNextDate: null,
    typicalDayOfMonth: null,
    amountTrend: "stable",
    lastAmounts: [],
    priceChangeDetected: false,
    transactionCount: sorted.length,
    originalCurrency: null,
    lastOriginalAmount: null,
    amountSignature: "",
    transactionIds: sorted.map((t) => t.id),
    delayedTransactionIds: [],
    missingPeriods: [],
    isDuplicateSubscription: false,
  };

  if (sorted.length < 3) return noResult;

  const intervals = computeIntervals(sorted);
  if (intervals.length === 0) return noResult;

  // Quick filter: if median interval < 5 days, it's frequent purchases
  const medianInterval = median(intervals);
  if (medianInterval < 5) return noResult;

  // 1. Cadence detection
  const cadence = mapToCadence(medianInterval);
  if (!cadence) return noResult;

  // 2. Regularity scoring
  const expectedInterval = cadenceToExpectedDays(cadence);
  const intervalsWithinTolerance = intervals.filter(
    (i) => Math.abs(i - expectedInterval) / expectedInterval <= 0.2,
  );
  const regularity = intervalsWithinTolerance.length / intervals.length;

  if (regularity < 0.6) return noResult;

  // 3. Day-of-month vs fixed-interval
  const daysOfMonth = sorted.map((t) => new Date(t.date).getUTCDate());
  const domStdDev = standardDeviation(daysOfMonth);
  const pattern: RecurrencePattern =
    domStdDev <= 3 ? "day_of_month" : "fixed_interval";

  // 4. Predict next date
  const lastDate = sorted[sorted.length - 1].date;
  let predictedNext: string;
  let typicalDayOfMonth: number | null = null;

  if (pattern === "day_of_month" && cadence !== "weekly" && cadence !== "biweekly") {
    typicalDayOfMonth = mode(daysOfMonth);
    const cadenceForNext =
      cadence === "yearly" || cadence === "semi_annual" || cadence === "quarterly" || cadence === "monthly"
        ? cadence
        : "monthly";
    predictedNext = nextCadenceDate(lastDate, typicalDayOfMonth, cadenceForNext);
  } else {
    predictedNext = addDays(lastDate, Math.round(medianInterval));
  }

  predictedNext = adjustForBusinessDays(predictedNext);

  // 5. Amount analysis (in original currency when available)
  const amounts: AmountObservation[] = sorted.map((t) => ({
    value: t.originalAmountCents !== null
      ? Math.abs(t.originalAmountCents)
      : Math.abs(t.amountCents),
    currency: t.originalCurrency ?? t.currency,
    date: t.date,
  }));

  const amountTrend = detectTrend(amounts);
  const lastAmount = amounts[amounts.length - 1];
  const prevAmount = amounts.length >= 2 ? amounts[amounts.length - 2] : null;
  const priceChangeDetected = prevAmount
    ? Math.abs(lastAmount.value - prevAmount.value) / prevAmount.value > 0.1 &&
      lastAmount.currency === prevAmount.currency
    : false;

  const lastTxn = sorted[sorted.length - 1];

  return {
    isRecurring: true,
    merchant,
    cadence,
    confidence: regularity,
    pattern,
    predictedNextDate: predictedNext,
    typicalDayOfMonth,
    amountTrend,
    lastAmounts: amounts.slice(-6),
    priceChangeDetected,
    transactionCount: sorted.length,
    originalCurrency: lastTxn.originalCurrency,
    lastOriginalAmount: lastTxn.originalAmountCents !== null
      ? Math.abs(lastTxn.originalAmountCents)
      : null,
    amountSignature: computeAmountSignature(amounts),
    transactionIds: sorted.map((t) => t.id),
    delayedTransactionIds: [],
    missingPeriods: [],
    isDuplicateSubscription: false,
  };
}

// ---------------------------------------------------------------------------
// Interleaved duplicate subscription detection
// ---------------------------------------------------------------------------

/**
 * The "doubled cadence" map: if a cluster's detected cadence is X,
 * the individual subscriptions would each have cadence 2X.
 */
const DOUBLED_CADENCE: Partial<Record<BillCadence, BillCadence>> = {
  biweekly: "monthly",
  monthly: "quarterly",
  quarterly: "semi_annual",
  semi_annual: "yearly",
};

/**
 * Analyze a date-sorted, amount-clustered set of transactions for one
 * merchant. Returns 1 result for a normal recurring pattern, or 2 results
 * (flagged as duplicate subscriptions) when two interleaved subscriptions
 * at the same price point are detected.
 *
 * Detection heuristic:
 *   If the cluster maps to cadence X, but cadence 2X also exists, try
 *   splitting into even-indexed and odd-indexed subsequences. If BOTH
 *   subsequences independently qualify as recurring at cadence 2X, return
 *   them separately with isDuplicateSubscription = true and distinct
 *   amountSignatures.
 *
 * Example: two monthly Netflix subs produce ~15-day intervals → biweekly.
 * Split into even/odd → each ~30 days → monthly. Flag both.
 */
export function analyzeCluster(
  sorted: RecurringTransactionInput[],
  merchant: string,
): RecurrenceAnalysis[] {
  const single = analyzeRecurrence(sorted, merchant);

  // If not recurring at all, or fewer than 6 transactions (need 3+ per
  // subsequence), skip interleave detection.
  if (!single.isRecurring || sorted.length < 6) {
    return single.isRecurring ? [single] : [];
  }

  const doubleCadence = DOUBLED_CADENCE[single.cadence];
  if (!doubleCadence) return [single];

  // Split into even-indexed and odd-indexed subsequences (by date order)
  const even = sorted.filter((_, i) => i % 2 === 0);
  const odd = sorted.filter((_, i) => i % 2 !== 0);

  if (even.length < 3 || odd.length < 3) return [single];

  const analysisA = analyzeRecurrence(even, merchant);
  const analysisB = analyzeRecurrence(odd, merchant);

  // Both subsequences must be recurring at the expected doubled cadence
  if (
    !analysisA.isRecurring ||
    !analysisB.isRecurring ||
    analysisA.cadence !== doubleCadence ||
    analysisB.cadence !== doubleCadence
  ) {
    return [single];
  }

  // Confirmed interleaved duplicate subscriptions — return both with
  // distinct signatures (append ~0 / ~1) and the duplicate flag.
  const baseSig = analysisA.amountSignature || computeAmountSignature(
    even.map((t) => ({
      value: t.originalAmountCents !== null
        ? Math.abs(t.originalAmountCents)
        : Math.abs(t.amountCents),
      currency: t.originalCurrency ?? t.currency,
      date: t.date,
    })),
  );

  return [
    { ...analysisA, amountSignature: `${baseSig}~0`, isDuplicateSubscription: true },
    { ...analysisB, amountSignature: `${baseSig}~1`, isDuplicateSubscription: true },
  ];
}

// =========================================================================
// Histogram-based pattern extraction (primary detection tier)
// =========================================================================

// ---------------------------------------------------------------------------
// Day-of-month histogram peak detection
// ---------------------------------------------------------------------------

export interface DayPeak {
  anchorDay: number;
  transactions: RecurringTransactionInput[];
}

/**
 * Convert a YYYY-MM-DD string to an integer year-month
 * (year * 12 + monthIndex) for gap computation.
 */
export function toYearMonth(dateStr: string): number {
  const d = new Date(dateStr + "T12:00:00Z");
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

function yearMonthToLabel(ym: number): string {
  const year = Math.floor(ym / 12);
  const month = String((ym % 12) + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function expectedDateForYearMonth(ym: number, anchorDay: number): string {
  const year = Math.floor(ym / 12);
  const month = ym % 12;
  const maxDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(anchorDay, maxDay);
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

function calendarDaysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA + "T12:00:00Z");
  const b = new Date(dateB + "T12:00:00Z");
  return Math.abs(
    Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24)),
  );
}

/**
 * Find significant day-of-month peaks in a set of transactions.
 *
 * Scans all 31 possible anchor days, scoring each by how many
 * transactions fall within ±tolerance. Peaks are claimed greedily
 * (strongest first) via non-maximum suppression so a transaction
 * can only belong to one peak.
 */
export function findDayOfMonthPeaks(
  txns: RecurringTransactionInput[],
  tolerance: number = 2,
  minCount: number = 3,
): DayPeak[] {
  if (txns.length < minCount) return [];

  // Build exact day-of-month buckets
  const byDay = new Map<number, RecurringTransactionInput[]>();
  for (const txn of txns) {
    const dom = new Date(txn.date + "T12:00:00Z").getUTCDate();
    const list = byDay.get(dom) ?? [];
    list.push(txn);
    byDay.set(dom, list);
  }

  // Score each anchor day by the sum of transactions within ±tolerance.
  const scores: { day: number; count: number }[] = [];
  for (let day = 1; day <= 31; day++) {
    let count = 0;
    for (let d = day - tolerance; d <= day + tolerance; d++) {
      if (d >= 1 && d <= 31) {
        count += (byDay.get(d) ?? []).length;
      }
    }
    scores.push({ day, count });
  }

  // Sort descending — strongest peaks first
  scores.sort((a, b) => b.count - a.count);

  // Non-maximum suppression: each transaction is claimed by at most one peak
  const claimed = new Set<string>();
  const peaks: DayPeak[] = [];

  for (const { day, count } of scores) {
    if (count < minCount) break;

    const peakTxns: RecurringTransactionInput[] = [];
    for (let d = day - tolerance; d <= day + tolerance; d++) {
      if (d < 1 || d > 31) continue;
      for (const txn of byDay.get(d) ?? []) {
        if (!claimed.has(txn.id)) {
          peakTxns.push(txn);
          claimed.add(txn.id);
        }
      }
    }

    if (peakTxns.length >= minCount) {
      // Use mode of actual transaction days as anchor (not window center)
      const actualDays = peakTxns.map(
        (t) => new Date(t.date + "T12:00:00Z").getUTCDate(),
      );
      peaks.push({ anchorDay: mode(actualDays), transactions: peakTxns });
    }
  }

  return peaks;
}

// ---------------------------------------------------------------------------
// Month-gap cadence determination
// ---------------------------------------------------------------------------

interface CadenceResult {
  cadence: BillCadence;
  regularity: number;
}

/**
 * Determine cadence from the month distribution of a sorted transaction
 * subsequence. Tries each cadence and picks the best fit.
 */
export function determineCadenceFromMonthGaps(
  sorted: RecurringTransactionInput[],
): CadenceResult | null {
  if (sorted.length < 3) return null;

  const months = sorted.map((t) => toYearMonth(t.date));
  // De-duplicate: if multiple transactions land in the same month (delayed
  // payment already reconciled), keep only distinct year-months.
  const uniqueMonths = [...new Set(months)].sort((a, b) => a - b);
  if (uniqueMonths.length < 3) return null;

  const gaps: number[] = [];
  for (let i = 1; i < uniqueMonths.length; i++) {
    gaps.push(uniqueMonths[i] - uniqueMonths[i - 1]);
  }

  const candidates: [number, BillCadence][] = [
    [1, "monthly"],
    [3, "quarterly"],
    [6, "semi_annual"],
    [12, "yearly"],
  ];

  let bestCadence: BillCadence | null = null;
  let bestRegularity = 0;

  for (const [expectedGap, cadence] of candidates) {
    // Monthly and quarterly cadence must use exact month gaps; otherwise a
    // stable bimonthly merchant can be misread as either a monthly bill with
    // every other payment missing or a quarterly bill shifted by one month.
    // Longer cadences allow a one-month bank/provider shift.
    const tolerance = expectedGap <= 3 ? 0 : 1;
    const matching = gaps.filter(
      (g) => Math.abs(g - expectedGap) <= tolerance,
    );
    const regularity = matching.length / gaps.length;
    // Sparse cadences (semi-annual, yearly) have fewer gaps to verify so
    // random alignment probability is higher — require stronger evidence.
    const minRegularity = expectedGap >= 6 ? 0.75 : 0.6;
    if (regularity > bestRegularity && regularity >= minRegularity) {
      bestRegularity = regularity;
      bestCadence = cadence;
    }
  }

  if (!bestCadence) return null;
  return { cadence: bestCadence, regularity: bestRegularity };
}

// ---------------------------------------------------------------------------
// Delayed payment reconciliation
// ---------------------------------------------------------------------------

/**
 * After a peak is found, look for payments that arrived late (wider
 * tolerance) in months where an expected payment is missing.
 *
 * Returns delayed matches and a list of truly missing year-month labels.
 * Mutates `claimed` to mark delayed transactions so downstream peaks or
 * weekly detection won't reuse them.
 */
export function reconcileDelayedPayments(
  peakTransactions: RecurringTransactionInput[],
  allClusterTransactions: RecurringTransactionInput[],
  anchorDay: number,
  cadence: BillCadence,
  claimed: Set<string>,
): { delayed: RecurringTransactionInput[]; missingPeriods: string[] } {
  const peakMonths = new Set(
    peakTransactions.map((t) => toYearMonth(t.date)),
  );
  const sortedMonths = [...peakMonths].sort((a, b) => a - b);
  if (sortedMonths.length < 2) return { delayed: [], missingPeriods: [] };

  const firstMonth = sortedMonths[0];
  const lastMonth = sortedMonths[sortedMonths.length - 1];

  const cadenceMonths =
    cadence === "yearly"
      ? 12
      : cadence === "semi_annual"
        ? 6
        : cadence === "quarterly"
          ? 3
          : 1;

  // Build list of expected months between first and last observed payment
  const expectedMonths: number[] = [];
  for (let m = firstMonth; m <= lastMonth; m += cadenceMonths) {
    expectedMonths.push(m);
  }

  const delayed: RecurringTransactionInput[] = [];
  const missingPeriods: string[] = [];

  for (const expectedMonth of expectedMonths) {
    if (peakMonths.has(expectedMonth)) continue;

    const expectedDate = expectedDateForYearMonth(expectedMonth, anchorDay);

    // Search with wider calendar tolerance (±10 days) around the expected
    // occurrence. This intentionally crosses month boundaries for payments
    // posted late into the following month.
    const candidate = allClusterTransactions.find((t) => {
      if (claimed.has(t.id)) return false;
      return calendarDaysBetween(t.date, expectedDate) <= 10;
    });

    if (candidate) {
      delayed.push(candidate);
      claimed.add(candidate.id);
    } else {
      missingPeriods.push(yearMonthToLabel(expectedMonth));
    }
  }

  return { delayed, missingPeriods };
}

// ---------------------------------------------------------------------------
// Weekly pattern detection (Tier 2 — interval-based, unclaimed only)
// ---------------------------------------------------------------------------

/**
 * Detect a weekly recurring pattern from transactions not claimed by any
 * day-of-month peak. Requires 8+ transactions with consistent ~7-day
 * intervals and low amount variation.
 */
function detectWeeklyPattern(
  sorted: RecurringTransactionInput[],
  merchant: string,
): RecurrenceAnalysis | null {
  if (sorted.length < 8) return null;

  const intervals = computeIntervals(sorted);
  if (intervals.length === 0) return null;

  const medianInterval = median(intervals);
  if (medianInterval < 6 || medianInterval > 8) return null;

  const withinTolerance = intervals.filter(
    (i) => Math.abs(i - 7) / 7 <= 0.2,
  );
  const regularity = withinTolerance.length / intervals.length;
  if (regularity < 0.6) return null;

  // Weekly patterns must have consistent amounts
  const amounts: AmountObservation[] = sorted.map((t) => ({
    value: t.originalAmountCents !== null
      ? Math.abs(t.originalAmountCents)
      : Math.abs(t.amountCents),
    currency: t.originalCurrency ?? t.currency,
    date: t.date,
  }));
  const cov = coefficientOfVariation(amounts.map((a) => a.value));
  if (cov > 0.15) return null;

  const amountTrend = detectTrend(amounts);
  const lastTxn = sorted[sorted.length - 1];
  const lastAmount = amounts[amounts.length - 1];
  const prevAmount = amounts.length >= 2 ? amounts[amounts.length - 2] : null;
  const priceChangeDetected = prevAmount
    ? Math.abs(lastAmount.value - prevAmount.value) / prevAmount.value > 0.1 &&
      lastAmount.currency === prevAmount.currency
    : false;

  const predictedNext = adjustForBusinessDays(
    addDays(lastTxn.date, 7),
  );

  const depthFactor = Math.min(1, sorted.length / 8);
  const confidence = regularity * depthFactor;

  return {
    isRecurring: true,
    merchant,
    cadence: "weekly",
    confidence,
    pattern: "fixed_interval",
    predictedNextDate: predictedNext,
    typicalDayOfMonth: null,
    amountTrend,
    lastAmounts: amounts.slice(-6),
    priceChangeDetected,
    transactionCount: sorted.length,
    originalCurrency: lastTxn.originalCurrency,
    lastOriginalAmount: lastTxn.originalAmountCents !== null
      ? Math.abs(lastTxn.originalAmountCents)
      : null,
    amountSignature: computeAmountSignature(amounts),
    transactionIds: sorted.map((t) => t.id),
    delayedTransactionIds: [],
    missingPeriods: [],
    isDuplicateSubscription: false,
  };
}

// ---------------------------------------------------------------------------
// Main entry point: extract all recurring patterns from a cluster
// ---------------------------------------------------------------------------

/**
 * Extract recurring patterns from a date-sorted, amount-clustered set of
 * transactions for one merchant.
 *
 * Tier 1: Day-of-month histogram peaks → monthly / quarterly / semi-annual /
 *         yearly patterns, with delayed-payment reconciliation.
 * Tier 2: Weekly interval detection on remaining unclaimed transactions.
 *
 * Returns 0–N patterns. Multiple patterns from the same cluster are
 * flagged isDuplicateSubscription (possible duplicate subscriptions).
 */
export function extractPatterns(
  clusterTransactions: RecurringTransactionInput[],
  merchant: string,
): RecurrenceAnalysis[] {
  if (clusterTransactions.length < 3) return [];

  const sorted = [...clusterTransactions].sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  const results: RecurrenceAnalysis[] = [];
  const claimed = new Set<string>();

  // --- Tier 1: Day-of-month histogram patterns ---

  const peaks = findDayOfMonthPeaks(sorted);

  // First pass: identify which peaks have a valid cadence
  const passedPeaks: {
    peak: DayPeak;
    cadenceResult: CadenceResult;
    peakSorted: RecurringTransactionInput[];
  }[] = [];

  for (const peak of peaks) {
    const peakSorted = [...peak.transactions].sort((a, b) =>
      a.date.localeCompare(b.date),
    );

    const cadenceResult = determineCadenceFromMonthGaps(peakSorted);
    if (!cadenceResult) continue;

    // Noise filter: a genuine subscription has roughly 1 transaction per
    // expected period. If a peak has many more transactions per distinct
    // month than the cadence expects, it's a noisy merchant (e.g., daily
    // grocery where every day happens to have 3+ transactions spanning
    // 3 months). Allow up to 2× for occasional doubles or delayed payments.
    const uniqueMonthCount = new Set(
      peakSorted.map((t) => toYearMonth(t.date)),
    ).size;
    if (peakSorted.length / uniqueMonthCount > 2) continue;

    passedPeaks.push({ peak, cadenceResult, peakSorted });
  }

  // Sanity cap: a single amount cluster producing 4+ distinct calendar
  // patterns is noise (e.g., daily grocery where every day looks monthly
  // over 3+ months). No merchant realistically has that many recurring
  // subscriptions at the same price point.
  if (passedPeaks.length > 3) {
    passedPeaks.length = 0;
  }

  // Claim transactions from all passed peaks before reconciliation
  // so delayed-payment searches don't grab another peak's core data.
  for (const { peak } of passedPeaks) {
    for (const t of peak.transactions) claimed.add(t.id);
  }

  // Second pass: reconcile delayed payments and build results
  for (const { peak, cadenceResult, peakSorted } of passedPeaks) {
    const { delayed, missingPeriods } = reconcileDelayedPayments(
      peakSorted,
      sorted,
      peak.anchorDay,
      cadenceResult.cadence,
      claimed,
    );

    const allMatched = [...peakSorted, ...delayed].sort((a, b) =>
      a.date.localeCompare(b.date),
    );

    // Amount analysis
    const amounts: AmountObservation[] = allMatched.map((t) => ({
      value: t.originalAmountCents !== null
        ? Math.abs(t.originalAmountCents)
        : Math.abs(t.amountCents),
      currency: t.originalCurrency ?? t.currency,
      date: t.date,
    }));

    const amountTrend = detectTrend(amounts);
    const lastAmount = amounts[amounts.length - 1];
    const prevAmount =
      amounts.length >= 2 ? amounts[amounts.length - 2] : null;
    const priceChangeDetected = prevAmount
      ? Math.abs(lastAmount.value - prevAmount.value) /
          prevAmount.value >
          0.1 && lastAmount.currency === prevAmount.currency
      : false;

    // Predict next date
    const lastTxn = allMatched[allMatched.length - 1];
    const cadenceForNext =
      cadenceResult.cadence === "yearly" ||
      cadenceResult.cadence === "semi_annual" ||
      cadenceResult.cadence === "quarterly" ||
      cadenceResult.cadence === "monthly"
        ? cadenceResult.cadence
        : "monthly";
    const predictedNext = adjustForBusinessDays(
      nextCadenceDate(lastTxn.date, peak.anchorDay, cadenceForNext),
    );

    // Confidence: regularity × depth factor (ramps from 0.6 at 3 txns to 1.0 at 5+)
    const coreCount = peakSorted.length;
    const totalEvidence = coreCount + delayed.length * 0.8;
    const depthFactor = Math.min(1, totalEvidence / 5);
    const confidence = cadenceResult.regularity * depthFactor;

    results.push({
      isRecurring: true,
      merchant,
      cadence: cadenceResult.cadence,
      confidence,
      pattern: "day_of_month",
      predictedNextDate: predictedNext,
      typicalDayOfMonth: peak.anchorDay,
      amountTrend,
      lastAmounts: amounts.slice(-6),
      priceChangeDetected,
      transactionCount: allMatched.length,
      originalCurrency: lastTxn.originalCurrency,
      lastOriginalAmount: lastTxn.originalAmountCents !== null
        ? Math.abs(lastTxn.originalAmountCents)
        : null,
      amountSignature: computeAmountSignature(amounts),
      transactionIds: allMatched.map((t) => t.id),
      delayedTransactionIds: delayed.map((t) => t.id),
      missingPeriods,
      isDuplicateSubscription: false,
    });
  }

  // --- Tier 2: Weekly interval detection on unclaimed ---

  const unclaimed = sorted.filter((t) => !claimed.has(t.id));
  const weeklyResult = detectWeeklyPattern(unclaimed, merchant);
  if (weeklyResult) results.push(weeklyResult);

  // Flag duplicate subscriptions when multiple patterns found in same cluster
  if (results.length > 1) {
    for (const r of results) r.isDuplicateSubscription = true;
  }

  return results;
}
