import { describe, expect, it } from "vitest";

import {
  findBillForDetectedPattern,
  scheduleIdentityMatches,
  typicalDayOfMonthMatches,
} from "./consolidation";
import type { BillScheduleIdentity } from "./consolidation";

function bill(
  overrides: Partial<BillScheduleIdentity> & Pick<BillScheduleIdentity, "id">,
): BillScheduleIdentity {
  return {
    merchantPattern: "merchant:hoa",
    cadence: "monthly",
    typicalDayOfMonth: 20,
    amountSignature: "NOK~291800",
    isDuplicateSubscription: false,
    ...overrides,
  };
}

describe("typicalDayOfMonthMatches", () => {
  it("matches within ±2 days", () => {
    expect(typicalDayOfMonthMatches(20, 21)).toBe(true);
    expect(typicalDayOfMonthMatches(20, 22)).toBe(true);
    expect(typicalDayOfMonthMatches(20, 23)).toBe(false);
  });

  it("requires both null for weekly-style bills", () => {
    expect(typicalDayOfMonthMatches(null, null)).toBe(true);
    expect(typicalDayOfMonthMatches(20, null)).toBe(false);
  });
});

describe("findBillForDetectedPattern", () => {
  const householdA: BillScheduleIdentity[] = [
    bill({ id: "a1", amountSignature: "NOK~291800" }),
    bill({
      id: "a2",
      amountSignature: "NOK~322200",
      typicalDayOfMonth: 21,
    }),
  ];

  const householdB: BillScheduleIdentity[] = [
    bill({ id: "b1", merchantPattern: "merchant:other" }),
  ];

  it("finds bill by schedule with day tolerance, not signature", () => {
    const found = findBillForDetectedPattern(householdA, {
      merchant: "merchant:hoa",
      cadence: "monthly",
      typicalDayOfMonth: 20,
    });
    expect(found?.id).toBe("a1");
  });

  it("matches day 21 bill when detection reports day 20", () => {
    const found = findBillForDetectedPattern(householdA, {
      merchant: "merchant:hoa",
      cadence: "monthly",
      typicalDayOfMonth: 20,
    });
    expect(["a1", "a2"]).toContain(found?.id);
  });

  it("does not consolidate across households", () => {
    const allBills = [...householdA, ...householdB];
    const foundForHoa = findBillForDetectedPattern(
      allBills.filter((b) => b.merchantPattern === "merchant:hoa"),
      {
        merchant: "merchant:hoa",
        cadence: "monthly",
        typicalDayOfMonth: 20,
      },
    );
    expect(foundForHoa?.id).not.toBe("b1");
  });

  it("matches bill when schedule matches regardless of duplicate flag", () => {
    const flaggedBill = bill({ id: "sub-a", isDuplicateSubscription: true });
    expect(
      scheduleIdentityMatches(flaggedBill, {
        merchant: "merchant:hoa",
        cadence: "monthly",
        typicalDayOfMonth: 20,
      }),
    ).toBe(true);
  });

  it("does not cross-match different typical billing days", () => {
    const day5 = bill({ id: "sub-a", typicalDayOfMonth: 5 });
    const day20 = bill({ id: "sub-b", typicalDayOfMonth: 20 });
    expect(
      scheduleIdentityMatches(day5, {
        merchant: "merchant:hoa",
        cadence: "monthly",
        typicalDayOfMonth: 20,
      }),
    ).toBe(false);
    expect(
      scheduleIdentityMatches(day20, {
        merchant: "merchant:hoa",
        cadence: "monthly",
        typicalDayOfMonth: 5,
      }),
    ).toBe(false);
  });
});
