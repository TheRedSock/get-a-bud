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
    return Math.abs(dom - bill.typicalDayOfMonth) <= 2;
  }

  const anchorDay = bill.typicalDayOfMonth ?? dateDayOfMonth(bill.nextDueDate);
  let expected = bill.nextDueDate;

  for (let i = 0; i < 36 && daysBetween(expected, row.date) > 2; i++) {
    const next = advanceExpectedDueDate(expected, bill.cadence, anchorDay);
    if (next === expected) break;
    expected = next;
  }

  if (Math.abs(daysBetween(expected, row.date)) <= 2) return true;

  const monthStep = monthCadenceStep(bill.cadence);
  if (monthStep == null || bill.typicalDayOfMonth == null) return false;

  const expectedDate = new Date(expected + "T12:00:00Z");
  const rowDate = new Date(row.date + "T12:00:00Z");
  const monthGap =
    (rowDate.getUTCFullYear() - expectedDate.getUTCFullYear()) * 12 +
    (rowDate.getUTCMonth() - expectedDate.getUTCMonth());

  if (monthGap < 0 || monthGap % monthStep !== 0) return false;

  const rowDom = rowDate.getUTCDate();
  const rowMonthLastDay = new Date(
    Date.UTC(rowDate.getUTCFullYear(), rowDate.getUTCMonth() + 1, 0),
  ).getUTCDate();

  return (
    Math.abs(rowDom - bill.typicalDayOfMonth) <= 2 ||
    (bill.typicalDayOfMonth >= 29 &&
      rowDom === rowMonthLastDay &&
      rowMonthLastDay < bill.typicalDayOfMonth)
  );
}

export function comparableAmountForBill(
  row: RecurringCandidateRow,
  bill: ExistingRecurringBill,
): number | null {
  if (bill.originalCurrency) {
    if (
      row.originalCurrency !== bill.originalCurrency ||
      row.originalAmountCents == null
    ) {
      return null;
    }
    return Math.abs(row.originalAmountCents);
  }

  return Math.abs(row.amountCents);
}

export function isRecurringDetectionIgnored(
  metadata: Record<string, unknown> | null,
) {
  return Boolean(
    (metadata as RecurringDetectionMetadata | null)?.recurringDetection?.ignored,
  );
}
