import {
  cadenceToExpectedDays,
  type BillCadence,
} from "@/lib/classification/recurring";

function calendarDaysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA + "T12:00:00Z");
  const b = new Date(dateB + "T12:00:00Z");
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Determines if a recurring bill should be considered ended based on
 * time elapsed since last payment relative to its cadence (2× period rule).
 */
export function isBillPastEndThreshold(params: {
  lastPaymentDate: string;
  cadence: BillCadence;
  asOf?: Date;
}): boolean {
  if (params.cadence === "unknown") return false;

  const asOf = params.asOf ?? new Date();
  const asOfStr = asOf.toISOString().slice(0, 10);
  const elapsedDays = calendarDaysBetween(params.lastPaymentDate, asOfStr);
  const thresholdDays = cadenceToExpectedDays(params.cadence) * 2;

  return elapsedDays > thresholdDays;
}

export function daysOverdueVsDueDate(params: {
  nextDueDate: string;
  asOf?: Date;
}): number {
  const asOf = params.asOf ?? new Date();
  const asOfStr = asOf.toISOString().slice(0, 10);
  return calendarDaysBetween(params.nextDueDate, asOfStr);
}
