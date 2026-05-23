import { formatCents } from "@/lib/finance/money";

export type BillAmountDisplay = {
  expectedAmountCents: number | null;
  lastAmountCents: number | null;
  originalCurrency: string | null;
  lastOriginalAmountCents: number | null;
};

/**
 * Format a recurring bill's amount for UI: original currency when tracked,
 * otherwise household book currency (NOK).
 */
export function formatBillAmount(bill: BillAmountDisplay): string {
  if (bill.originalCurrency && bill.lastOriginalAmountCents != null) {
    return formatCents(bill.lastOriginalAmountCents, bill.originalCurrency);
  }

  const bookCents = bill.expectedAmountCents ?? bill.lastAmountCents ?? 0;
  return formatCents(bookCents);
}

/**
 * Cents value for the edit form's "Expected Amount" field.
 * Always returns book-currency (NOK) cents — the value used by match-phase
 * tolerance checks. Display formatting uses formatBillAmount() separately.
 */
export function billAmountCentsForEdit(bill: BillAmountDisplay): number {
  return bill.expectedAmountCents ?? bill.lastAmountCents ?? 0;
}
