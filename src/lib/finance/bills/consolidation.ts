import type { RecurrenceAnalysis } from "@/lib/classification/recurring/types";

/** Same tolerance as dateMatchesSlot / dateMatchesBillCadence. */
export const TYPICAL_DAY_OF_MONTH_TOLERANCE = 2;

export type BillScheduleIdentity = {
  id: string;
  merchantPattern: string;
  cadence: string;
  typicalDayOfMonth: number | null;
  amountSignature: string;
  isDuplicateSubscription: boolean;
};

export function typicalDayOfMonthMatches(
  existing: number | null,
  detected: number | null,
): boolean {
  if (existing == null && detected == null) return true;
  if (existing == null || detected == null) return false;
  return Math.abs(existing - detected) <= TYPICAL_DAY_OF_MONTH_TOLERANCE;
}

export function scheduleIdentityMatches(
  bill: BillScheduleIdentity,
  result: Pick<
    RecurrenceAnalysis,
    "merchant" | "cadence" | "typicalDayOfMonth" | "isDuplicateSubscription"
  >,
): boolean {
  if (bill.merchantPattern !== result.merchant) return false;
  if (bill.cadence !== result.cadence) return false;
  if (bill.isDuplicateSubscription !== result.isDuplicateSubscription) {
    return false;
  }
  return typicalDayOfMonthMatches(
    bill.typicalDayOfMonth,
    result.typicalDayOfMonth,
  );
}

/**
 * Find an existing bill with the same merchant schedule (±2 days on anchor).
 */
export function findBillForDetectedPattern<T extends BillScheduleIdentity>(
  householdBills: T[],
  result: Pick<
    RecurrenceAnalysis,
    "merchant" | "cadence" | "typicalDayOfMonth" | "isDuplicateSubscription"
  >,
): T | undefined {
  return householdBills.find((bill) => scheduleIdentityMatches(bill, result));
}


