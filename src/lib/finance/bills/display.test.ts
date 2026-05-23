import { describe, expect, it } from "vitest";

import { billAmountCentsForEdit, formatBillAmount } from "./display";

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
