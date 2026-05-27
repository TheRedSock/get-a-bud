import { formatCents, formatCentsParts } from "@/lib/finance/money";

export type BillAmountDisplay = {
  expectedAmountCents: number | null;
  lastAmountCents: number | null;
  originalCurrency: string | null;
  lastOriginalAmountCents: number | null;
};

export type BillScheduleInput = {
  isActive: boolean;
  nextDueDate: string | null;
  userEndedAt: Date | null;
  autoEndedAt: Date | null;
  lastPaymentDate: string | null;
  updatedAt: Date;
};

const DISPLAY_LOCALE = "nb-NO";

/** Locale for English schedule copy (due / ended labels). */
export const BILL_SCHEDULE_LOCALE = "en-US";

/**
 * Format a recurring bill's amount for UI: original currency when tracked,
 * otherwise household book currency (NOK).
 */
export function formatBillAmount(bill: BillAmountDisplay): string {
  const { amount, suffix } = formatBillAmountParts(bill);
  return `${amount} ${suffix}`;
}

export function formatBillAmountParts(
  bill: BillAmountDisplay,
): { amount: string; suffix: string } {
  const { cents, currency } = billAmountCentsAndCurrency(bill);
  return formatCentsParts(cents, currency, DISPLAY_LOCALE);
}

export function billAmountCentsAndCurrency(bill: BillAmountDisplay): {
  cents: number;
  currency: string;
} {
  if (bill.originalCurrency && bill.lastOriginalAmountCents != null) {
    return {
      cents: bill.lastOriginalAmountCents,
      currency: bill.originalCurrency,
    };
  }

  return {
    cents: bill.expectedAmountCents ?? bill.lastAmountCents ?? 0,
    currency: "NOK",
  };
}

/**
 * Cents value for the edit form's "Expected Amount" field.
 * Always returns book-currency (NOK) cents — the value used by match-phase
 * tolerance checks. Display formatting uses formatBillAmount() separately.
 */
export function billAmountCentsForEdit(bill: BillAmountDisplay): number {
  return bill.expectedAmountCents ?? bill.lastAmountCents ?? 0;
}

/** Normalize timestamp or ISO date string for display. */
export function formatEventDate(
  value: Date | string | null,
  locale: string = DISPLAY_LOCALE,
): string | null {
  if (value == null) return null;
  const date =
    value instanceof Date
      ? value
      : new Date(`${String(value).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function calendarDaysUntilDue(nextDueDate: string, asOf: Date): number {
  const asOfStr = asOf.toISOString().slice(0, 10);
  const due = new Date(`${nextDueDate}T12:00:00Z`);
  const today = new Date(`${asOfStr}T12:00:00Z`);
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Relative due copy for active bills within ~1 month; absolute date beyond.
 */
export function formatBillDueLabel(
  nextDueDate: string | null,
  asOf: Date = new Date(),
): string {
  if (!nextDueDate) return "No due date";

  const daysUntilDue = calendarDaysUntilDue(nextDueDate, asOf);

  if (daysUntilDue === -1) return "Due yesterday";
  if (daysUntilDue === 0) return "Due today";
  if (daysUntilDue === 1) return "Due tomorrow";
  if (daysUntilDue >= 2 && daysUntilDue <= 31) {
    return `Due in ${daysUntilDue} days`;
  }
  if (daysUntilDue < -1) {
    const overdue = Math.abs(daysUntilDue);
    return `Past due by ${overdue} day${overdue === 1 ? "" : "s"}`;
  }

  return `Due ${formatEventDate(nextDueDate, BILL_SCHEDULE_LOCALE) ?? nextDueDate}`;
}

function formatEndedLabel(bill: BillScheduleInput): string {
  const scheduleLocale = BILL_SCHEDULE_LOCALE;

  const userEnded = formatEventDate(bill.userEndedAt, scheduleLocale);
  if (userEnded) return `You ended this on ${userEnded}`;

  const lastPaid = formatEventDate(bill.lastPaymentDate, scheduleLocale);
  if (lastPaid) return `Last payment on ${lastPaid}`;

  const fallback = formatEventDate(bill.updatedAt, scheduleLocale);
  return fallback ? `Ended ${fallback}` : "Ended";
}

/**
 * Schedule line for list/dashboard: ended copy for inactive bills, due copy for active.
 */
export function formatBillScheduleLabel(bill: BillScheduleInput): string {
  if (!bill.isActive) return formatEndedLabel(bill);
  return formatBillDueLabel(bill.nextDueDate);
}

export function parseAmountSignature(
  signature: string,
): { currency: string; cents: number } | null {
  const trimmed = signature.trim();
  if (!trimmed) return null;
  const sep = trimmed.indexOf("~");
  if (sep <= 0) return null;
  const currency = trimmed.slice(0, sep);
  const cents = Number.parseInt(trimmed.slice(sep + 1), 10);
  if (!currency || !Number.isFinite(cents)) return null;
  return { currency, cents };
}

export function formatAmountSignature(signature: string): string {
  const parsed = parseAmountSignature(signature);
  if (!parsed) return signature;
  return formatCents(parsed.cents, parsed.currency);
}

export function formatBillPatternSummary(params: {
  cadence: string;
  typicalDayOfMonth: number | null;
  amountSignature: string;
}): string {
  const cadenceLabel = params.cadence.replaceAll("_", " ");
  const dayPart =
    params.typicalDayOfMonth != null
      ? ` around day ${params.typicalDayOfMonth}`
      : "";
  const amountPart = params.amountSignature
    ? ` · ${formatAmountSignature(params.amountSignature)}`
    : "";
  return `${cadenceLabel}${dayPart}${amountPart}`;
}

export function formatCadenceLabel(cadence: string): string {
  return cadence.replaceAll("_", " ");
}
