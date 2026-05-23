import {
  addDays,
  adjustForBusinessDays,
  nextCadenceDate,
} from "@/lib/classification/recurring/calendar";

export type BillSchedulingShape = {
  typicalDayOfMonth: number | null;
  cadence: string;
  nextDueDate: string | null;
};

function dateDayOfMonth(date: string): number {
  return new Date(date + "T12:00:00Z").getUTCDate();
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
  bill: BillSchedulingShape,
): string | null {
  const anchorDay = bill.typicalDayOfMonth ?? dateDayOfMonth(paymentDate);
  const next = advanceExpectedDueDate(paymentDate, bill.cadence, anchorDay);
  return next === paymentDate ? null : adjustForBusinessDays(next);
}
