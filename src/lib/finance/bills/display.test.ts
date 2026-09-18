import { describe, expect, it } from "vitest";

import {
  billAmountCentsForEdit,
  formatAmountSignature,
  formatBillAmount,
  formatBillAmountParts,
  formatBillDueLabel,
  formatBillScheduleLabel,
  formatBillPatternSummary,
} from "./display";

describe("formatBillAmount", () => {
  it("formats original currency when present", () => {
    const formatted = formatBillAmount({
      expectedAmountCents: 25_000,
      lastAmountCents: 25_500,
      originalCurrency: "EUR",
      lastOriginalAmountCents: 2199,
    });
    expect(formatted).toBe("21,99 €");
  });

  it("formats book currency when no original", () => {
    const formatted = formatBillAmount({
      expectedAmountCents: 19_900,
      lastAmountCents: 19_900,
      originalCurrency: null,
      lastOriginalAmountCents: null,
    });
    expect(formatted).toMatch(/kr/i);
  });
});

describe("formatBillAmountParts", () => {
  it("returns book currency parts when no original", () => {
    expect(
      formatBillAmountParts({
        expectedAmountCents: 19_900,
        lastAmountCents: 19_900,
        originalCurrency: null,
        lastOriginalAmountCents: null,
      }),
    ).toEqual({ amount: "199,00", suffix: "kr" });
  });

  it("returns original currency parts when present", () => {
    expect(
      formatBillAmountParts({
        expectedAmountCents: 25_000,
        lastAmountCents: 25_500,
        originalCurrency: "EUR",
        lastOriginalAmountCents: 2199,
      }),
    ).toEqual({ amount: "21,99", suffix: "€" });
  });
});

describe("billAmountCentsForEdit", () => {
  it("returns book-currency cents even when original is present", () => {
    expect(
      billAmountCentsForEdit({
        expectedAmountCents: 25_000,
        lastAmountCents: 25_500,
        originalCurrency: "EUR",
        lastOriginalAmountCents: 2199,
      }),
    ).toBe(25_000);
  });

  it("falls back to lastAmountCents when expected is null", () => {
    expect(
      billAmountCentsForEdit({
        expectedAmountCents: null,
        lastAmountCents: 19_900,
        originalCurrency: null,
        lastOriginalAmountCents: null,
      }),
    ).toBe(19_900);
  });
});

describe("formatBillDueLabel", () => {
  const asOf = new Date("2026-05-24T12:00:00Z");

  it('uses "Due yesterday" for -1 day', () => {
    expect(formatBillDueLabel("2026-05-23", asOf)).toBe("Due yesterday");
  });

  it('uses "Due today" for same day', () => {
    expect(formatBillDueLabel("2026-05-24", asOf)).toBe("Due today");
  });

  it('uses "Due tomorrow" for +1 day', () => {
    expect(formatBillDueLabel("2026-05-25", asOf)).toBe("Due tomorrow");
  });
});

describe("formatBillScheduleLabel", () => {
  const asOf = new Date("2026-05-24T12:00:00Z");

  it("never shows due copy for inactive bills", () => {
    const label = formatBillScheduleLabel({
      isActive: false,
      nextDueDate: "2026-05-24",
      userEndedAt: new Date("2026-04-01"),
      autoEndedAt: null,
      lastPaymentDate: "2026-03-15",
      updatedAt: asOf,
    });
    expect(label).toBe("Last payment on Mar 15, 2026");
    expect(label).not.toMatch(/Due today/i);
    expect(label).not.toContain("You ended");
  });

  it("prefers last payment over userEndedAt for manually ended bills", () => {
    const label = formatBillScheduleLabel({
      isActive: false,
      nextDueDate: null,
      userEndedAt: new Date("2026-04-01"),
      autoEndedAt: null,
      lastPaymentDate: "2026-03-30",
      updatedAt: asOf,
    });
    expect(label).toBe("Last payment on Mar 30, 2026");
    expect(label).not.toContain("You ended");
  });

  it("shows last payment on en-US date for auto-ended bills", () => {
    const label = formatBillScheduleLabel({
      isActive: false,
      nextDueDate: null,
      userEndedAt: null,
      autoEndedAt: new Date("2026-05-26"),
      lastPaymentDate: "2026-03-30",
      updatedAt: asOf,
    });
    expect(label).toBe("Last payment on Mar 30, 2026");
    expect(label).not.toContain("automatically");
    expect(label).not.toContain("mai");
  });

  it("prefers last payment over autoEndedAt", () => {
    const label = formatBillScheduleLabel({
      isActive: false,
      nextDueDate: null,
      userEndedAt: null,
      autoEndedAt: new Date("2026-05-26"),
      lastPaymentDate: "2026-03-30",
      updatedAt: asOf,
    });
    expect(label).not.toContain("May 26");
  });
});

describe("formatAmountSignature", () => {
  it("formats NOK signature as money", () => {
    const formatted = formatAmountSignature("NOK~19900");
    expect(formatted).toMatch(/kr/i);
    expect(formatted).not.toContain("~");
  });
});

describe("formatBillPatternSummary", () => {
  it("omits merchant key", () => {
    const summary = formatBillPatternSummary({
      cadence: "monthly",
      typicalDayOfMonth: 15,
      amountSignature: "NOK~19900",
    });
    expect(summary).toContain("monthly");
    expect(summary).not.toContain("merchant:");
  });
});
