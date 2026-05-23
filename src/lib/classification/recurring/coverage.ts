/**
 * Post-detection validation: recurring patterns must cover a sufficient
 * share of the merchant's expense history (filters Foodora-style false positives).
 */

import { addDays, nextCadenceDate } from "./calendar";
import { coefficientOfVariation, toYearMonth } from "./analysis";
import type {
  BillCadence,
  RecurrenceAnalysis,
  RecurringTransactionInput,
} from "./types";

export const MIN_COVERAGE_RATIO = 0.4;
export const SLOT_FILL_MIN_RATIO = 0.6;
export const SLOT_FILL_MAX_AMOUNT_COV = 0.05;

export function minTransactionCountForSlotFillCadence(
  cadence: BillCadence,
): number {
  switch (cadence) {
    case "quarterly":
      return 4;
    case "semi_annual":
    case "yearly":
      return 3;
    default:
      return 3;
  }
}

const SLOT_FILL_CADENCES = new Set<BillCadence>([
  "quarterly",
  "semi_annual",
  "yearly",
]);

function calendarDaysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA + "T12:00:00Z");
  const b = new Date(dateB + "T12:00:00Z");
  return Math.abs(
    Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24)),
  );
}

function getComparableAmount(t: RecurringTransactionInput): number {
  return t.originalAmountCents !== null
    ? Math.abs(t.originalAmountCents)
    : Math.abs(t.amountCents);
}

function getComparableCurrency(t: RecurringTransactionInput): string {
  return t.originalCurrency ?? t.currency;
}

function medianAmount(pattern: RecurrenceAnalysis): number | null {
  if (pattern.lastAmounts.length === 0) return null;
  const values = pattern.lastAmounts.map((a) => a.value);
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function amountMatchesPattern(
  txn: RecurringTransactionInput,
  pattern: RecurrenceAnalysis,
): boolean {
  if (pattern.amountTrend === "volatile") return true;

  const expected = medianAmount(pattern);
  if (expected == null) return true;

  const currency = pattern.lastAmounts[pattern.lastAmounts.length - 1]?.currency;
  if (getComparableCurrency(txn) !== currency) return false;

  const amt = getComparableAmount(txn);
  return Math.abs(amt - expected) / Math.max(expected, 1) <= 0.15;
}

function expectedDateForYearMonth(ym: number, anchorDay: number): string {
  const year = Math.floor(ym / 12);
  const month = ym % 12;
  const maxDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(anchorDay, maxDay);
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

function monthStepForCadence(cadence: BillCadence): number | null {
  switch (cadence) {
    case "monthly":
      return 1;
    case "quarterly":
      return 3;
    case "semi_annual":
      return 6;
    case "yearly":
      return 12;
    default:
      return null;
  }
}

function buildExpectedSlots(
  pattern: RecurrenceAnalysis,
  minDate: string,
  maxDate: string,
): string[] {
  const slots: string[] = [];

  if (pattern.cadence === "weekly" || pattern.cadence === "biweekly") {
    const step = pattern.cadence === "weekly" ? 7 : 14;
    let cursor = minDate;
    while (cursor <= maxDate) {
      slots.push(cursor);
      cursor = addDays(cursor, step);
    }
    return slots;
  }

  const monthStep = monthStepForCadence(pattern.cadence);
  if (monthStep == null) return slots;

  const anchorDay =
    pattern.typicalDayOfMonth ??
    new Date(minDate + "T12:00:00Z").getUTCDate();

  let ym = toYearMonth(minDate);
  const endYm = toYearMonth(maxDate);

  while (ym <= endYm) {
    slots.push(expectedDateForYearMonth(ym, anchorDay));
    ym += monthStep;
  }

  return slots;
}

function dateMatchesSlot(txnDate: string, slotDate: string): boolean {
  return calendarDaysBetween(txnDate, slotDate) <= 2;
}

function transactionFitsPattern(
  txn: RecurringTransactionInput,
  pattern: RecurrenceAnalysis,
  slots: string[],
): boolean {
  if (pattern.transactionIds.includes(txn.id)) return true;
  if (!amountMatchesPattern(txn, pattern)) return false;

  for (const slot of slots) {
    if (dateMatchesSlot(txn.date, slot)) return true;
  }

  return false;
}

function patternAmountCoV(pattern: RecurrenceAnalysis): number {
  if (pattern.lastAmounts.length < 2) return 0;
  return coefficientOfVariation(pattern.lastAmounts.map((a) => a.value));
}

function slotFillRatio(
  pattern: RecurrenceAnalysis,
  sorted: RecurringTransactionInput[],
  slots: string[],
): number {
  if (slots.length === 0) return 0;

  const patternTxns = sorted.filter((txn) =>
    pattern.transactionIds.includes(txn.id),
  );

  let filled = 0;
  for (const slot of slots) {
    if (patternTxns.some((txn) => dateMatchesSlot(txn.date, slot))) {
      filled += 1;
    }
  }

  return filled / slots.length;
}

function patternTransactionDates(
  pattern: RecurrenceAnalysis,
  sorted: RecurringTransactionInput[],
): RecurringTransactionInput[] {
  return sorted.filter((txn) => pattern.transactionIds.includes(txn.id));
}

function passesSlotFillCoverage(
  pattern: RecurrenceAnalysis,
  sorted: RecurringTransactionInput[],
): boolean {
  if (!SLOT_FILL_CADENCES.has(pattern.cadence)) return false;

  const minCount = minTransactionCountForSlotFillCadence(pattern.cadence);
  if (pattern.transactionCount < minCount) return false;

  if (patternAmountCoV(pattern) > SLOT_FILL_MAX_AMOUNT_COV) return false;

  const patternTxns = patternTransactionDates(pattern, sorted);
  if (patternTxns.length === 0) return false;

  const minDate = patternTxns[0].date;
  const maxDate = patternTxns[patternTxns.length - 1].date;
  const slots = buildExpectedSlots(pattern, minDate, maxDate);

  return slotFillRatio(pattern, sorted, slots) >= SLOT_FILL_MIN_RATIO;
}

/**
 * Validates that a detected recurring pattern covers a significant
 * portion of the merchant's total transaction history.
 */
export function validatePatternCoverage(params: {
  pattern: RecurrenceAnalysis;
  allMerchantTransactions: RecurringTransactionInput[];
  minCoverageRatio?: number;
}): boolean {
  const denominator = params.allMerchantTransactions.length;
  if (denominator === 0) return false;

  const sorted = [...params.allMerchantTransactions].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const minDate = sorted[0].date;
  const maxDate = sorted[sorted.length - 1].date;
  const slots = buildExpectedSlots(params.pattern, minDate, maxDate);

  let numerator = 0;
  for (const txn of sorted) {
    if (transactionFitsPattern(txn, params.pattern, slots)) {
      numerator += 1;
    }
  }

  const minRatio = params.minCoverageRatio ?? MIN_COVERAGE_RATIO;
  if (numerator / denominator >= minRatio) return true;

  return passesSlotFillCoverage(params.pattern, sorted);
}
