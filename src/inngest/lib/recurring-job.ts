import {
  addDays,
  adjustForBusinessDays,
  nextCadenceDate,
} from "@/lib/classification/recurring/calendar";
import { nextDueDateAfterPayment as computeNextDueDateAfterPayment } from "@/lib/finance/bills/scheduling";

export type RecurringCandidateRow = {
  id: string;
  amountCents: number;
  currency: string;
  date: string;
  originalAmountCents: number | null;
  originalCurrency: string | null;
  merchantId: string | null;
  normalizedMerchantName: string | null;
  transactionType: string | null;
  metadata: Record<string, unknown> | null;
};

export type RecurringDetectionMetadata = Record<string, unknown> & {
  recurringDetection?: {
    ignored?: boolean;
  };
};

export type ExistingRecurringBill = {
  id: string;
  merchantPattern: string;
  typicalDayOfMonth: number | null;
  expectedAmountCents: number | null;
  originalCurrency: string | null;
  cadence: string;
  nextDueDate: string | null;
  pattern: string | null;
};

export function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA + "T12:00:00Z");
  const b = new Date(dateB + "T12:00:00Z");
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

export function dateDayOfMonth(date: string): number {
  return new Date(date + "T12:00:00Z").getUTCDate();
}

function monthCadenceStep(cadence: string): 1 | 3 | 6 | 12 | null {
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

function advanceExpectedDueDate(
  dueDate: string,
  cadence: string,
  anchorDay: number,
): string {
  switch (cadence) {
    case "weekly":
      return addDays(dueDate, 7);
    case "biweekly":
      return addDays(dueDate, 14);
    case "monthly":
    case "quarterly":
    case "semi_annual":
    case "yearly":
      return nextCadenceDate(
        dueDate,
        anchorDay,
        cadence as "monthly" | "quarterly" | "semi_annual" | "yearly",
      );
    default:
      return dueDate;
  }
}

export function nextDueDateAfterPayment(
  paymentDate: string,
  bill: ExistingRecurringBill,
): string | null {
  return computeNextDueDateAfterPayment(paymentDate, bill);
}

export function dateMatchesBillCadence(
  row: RecurringCandidateRow,
  bill: ExistingRecurringBill,
): boolean {
  if (!bill.nextDueDate) {
    if (bill.typicalDayOfMonth == null) return true;
    const dom = dateDayOfMonth(row.date);
    return (
      Math.abs(dom - bill.typicalDayOfMonth) <= 2 ||
      isLatePaymentForAnchor(dom, bill.typicalDayOfMonth)
    );
  }

  const anchorDay = bill.typicalDayOfMonth ?? dateDayOfMonth(bill.nextDueDate);
  let expected = bill.nextDueDate;

  for (let i = 0; i < 36 && daysBetween(expected, row.date) > 2; i++) {
    const next = advanceExpectedDueDate(expected, bill.cadence, anchorDay);
    if (next === expected) break;
    expected = next;
  }

  if (Math.abs(daysBetween(expected, row.date)) <= 2) return true;

  // Month-based cadence fallback: check if the transaction's month aligns
  // with the bill's cadence relative to the nextDueDate (not the forward-
  // walked position which may be unreliable for past transactions).
  const monthStep = monthCadenceStep(bill.cadence);
  if (monthStep == null || bill.typicalDayOfMonth == null) return false;

  const nextDueD = new Date(bill.nextDueDate + "T12:00:00Z");
  const rowDate = new Date(row.date + "T12:00:00Z");
  const rowDom = rowDate.getUTCDate();

  // Month offset from nextDueDate to the row's month
  const monthOffset =
    (rowDate.getUTCFullYear() - nextDueD.getUTCFullYear()) * 12 +
    (rowDate.getUTCMonth() - nextDueD.getUTCMonth());

  // Standard slot: the row's month aligns with the cadence
  if (monthAligns(monthOffset, monthStep)) {
    const rowMonthLastDay = new Date(
      Date.UTC(rowDate.getUTCFullYear(), rowDate.getUTCMonth() + 1, 0),
    ).getUTCDate();

    if (
      Math.abs(rowDom - bill.typicalDayOfMonth) <= 2 ||
      (bill.typicalDayOfMonth >= 29 &&
        rowDom === rowMonthLastDay &&
        rowMonthLastDay < bill.typicalDayOfMonth)
    ) {
      return true;
    }
  }

  // Late-payment recognition: a transaction on day 1–4 of month N may be a
  // delayed payment for the slot in month N-1 when the anchor is day 28–31.
  // Example: anchor day 29, bill due Feb 28 → transaction on Mar 2 (3 days
  // late across month boundary) should still match.
  if (bill.typicalDayOfMonth >= 28 && rowDom <= 4) {
    const prevSlotOffset = monthOffset - 1;
    if (monthAligns(prevSlotOffset, monthStep)) {
      // Verify the delay is reasonable: at most 6 days from the anchor in
      // the previous month.
      const prevMonthLastDay = new Date(
        Date.UTC(rowDate.getUTCFullYear(), rowDate.getUTCMonth(), 0),
      ).getUTCDate();
      const anchorInPrevMonth = Math.min(
        bill.typicalDayOfMonth,
        prevMonthLastDay,
      );
      const daysLate = prevMonthLastDay - anchorInPrevMonth + rowDom;
      return daysLate <= 6;
    }
  }

  return false;
}

/** Check if a month offset from the bill's nextDueDate aligns with the cadence. */
function monthAligns(monthOffset: number, monthStep: number): boolean {
  // JavaScript % can return negative remainders; normalize to [0, monthStep).
  const rem = ((monthOffset % monthStep) + monthStep) % monthStep;
  return rem === 0;
}

/** Late-payment heuristic: day 1–4 is a plausible late payment for anchor 28–31. */
function isLatePaymentForAnchor(
  rowDom: number,
  typicalDayOfMonth: number,
): boolean {
  if (typicalDayOfMonth < 28 || rowDom > 4) return false;
  // Day distance from anchor (assuming 30/31-day month crossing):
  // e.g., anchor 29 → day 2 = ~3 days late, anchor 31 → day 4 = ~4 days late
  return true;
}

/** Book-currency cents for amount tolerance checks (expectedAmountCents is NOK). */
export function comparableAmountForBill(
  row: RecurringCandidateRow,
  _bill: ExistingRecurringBill,
): number | null {
  return Math.abs(row.amountCents);
}

export function isRecurringDetectionIgnored(
  metadata: Record<string, unknown> | null,
) {
  return Boolean(
    (metadata as RecurringDetectionMetadata | null)?.recurringDetection?.ignored,
  );
}
