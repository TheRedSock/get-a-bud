import { describe, expect, it } from "vitest";

import {
  billAmountCentsForEdit,
  formatAmountSignature,
  formatBillAmount,
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
    expect(formatted).toContain("21");
    expect(formatted).not.toMatch(/kr\b/i);
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
      lastPaymentDate: null,
      updatedAt: asOf,
    });
    expect(label).toContain("You ended");
    expect(label).not.toMatch(/Due today/i);
  });

  it("shows auto-ended copy", () => {
    const label = formatBillScheduleLabel({
      isActive: false,
      nextDueDate: null,
      userEndedAt: null,
      autoEndedAt: new Date("2026-03-15"),
      lastPaymentDate: null,
      updatedAt: asOf,
    });
    expect(label).toContain("Ended automatically");
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
