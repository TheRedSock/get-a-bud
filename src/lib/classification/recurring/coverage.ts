/**
 * Post-detection validation: recurring patterns must cover a sufficient
 * share of the merchant's expense history (filters Foodora-style false positives).
 */

import { addDays, nextCadenceDate } from "./calendar";
import { toYearMonth } from "./analysis";
import type {
  BillCadence,
  RecurrenceAnalysis,
  RecurringTransactionInput,
} from "./types";

export const MIN_COVERAGE_RATIO = 0.4;

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
  return numerator / denominator >= minRatio;
}
