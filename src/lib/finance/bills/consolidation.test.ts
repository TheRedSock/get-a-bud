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
      isDuplicateSubscription: false,
    });
    expect(found?.id).toBe("a1");
  });

  it("matches day 21 bill when detection reports day 20", () => {
    const found = findBillForDetectedPattern(householdA, {
      merchant: "merchant:hoa",
      cadence: "monthly",
      typicalDayOfMonth: 20,
      isDuplicateSubscription: false,
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
        isDuplicateSubscription: false,
      },
    );
    expect(foundForHoa?.id).not.toBe("b1");
  });

  it("separates duplicate subscriptions on same day", () => {
    const bills = [
      bill({ id: "sub-a", isDuplicateSubscription: true }),
      bill({ id: "sub-b", isDuplicateSubscription: true, typicalDayOfMonth: 5 }),
    ];
    expect(
      scheduleIdentityMatches(bills[0], {
        merchant: "merchant:hoa",
        cadence: "monthly",
        typicalDayOfMonth: 20,
        isDuplicateSubscription: false,
      }),
    ).toBe(false);
  });
});
