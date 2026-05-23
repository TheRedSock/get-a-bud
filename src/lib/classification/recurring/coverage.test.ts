import { describe, expect, it } from "vitest";

import {
  MIN_COVERAGE_RATIO,
  validatePatternCoverage,
} from "./coverage";
import type { RecurrenceAnalysis, RecurringTransactionInput } from "./types";

function makeTxn(
  overrides: Partial<RecurringTransactionInput> & { date: string },
): RecurringTransactionInput {
  return {
    id: crypto.randomUUID(),
    amountCents: -19900,
    currency: "NOK",
    originalAmountCents: null,
    originalCurrency: null,
    normalizedMerchantName: "merchant",
    transactionType: "card_purchase",
    ...overrides,
  };
}

function monthlyPattern(
  merchant: string,
  dates: string[],
  amountCents = -19900,
): RecurrenceAnalysis {
  const txns = dates.map((date) =>
    makeTxn({ date, amountCents, normalizedMerchantName: merchant }),
  );
  return {
    isRecurring: true,
    merchant,
    cadence: "monthly",
    confidence: 0.9,
    pattern: "day_of_month",
    predictedNextDate: "2025-07-15",
    typicalDayOfMonth: 15,
    amountTrend: "stable",
    lastAmounts: [{ value: Math.abs(amountCents), currency: "NOK", date: dates.at(-1)! }],
    priceChangeDetected: false,
    transactionCount: txns.length,
    originalCurrency: null,
    lastOriginalAmount: null,
    amountSignature: "NOK~19900",
    transactionIds: txns.map((t) => t.id),
    delayedTransactionIds: [],
    missingPeriods: [],
    isDuplicateSubscription: false,
  };
}

describe("validatePatternCoverage", () => {
  it("rejects Foodora-style sparse alignment (3/32)", () => {
    const merchant = "foodora norway";
    const aligned = ["2024-06-26", "2024-07-29", "2024-08-26"];
    const pattern = monthlyPattern(merchant, aligned, -48400);

    const all: RecurringTransactionInput[] = [
      ...aligned.map((date, i) =>
        makeTxn({
          date,
          amountCents: -48400 - i * 1000,
          normalizedMerchantName: merchant,
        }),
      ),
    ];

    for (let i = 0; i < 29; i++) {
      const month = Math.floor(i / 10);
      const day = (i % 28) + 1;
      all.push(
        makeTxn({
          date: new Date(Date.UTC(2024, month, day)).toISOString().slice(0, 10),
          amountCents: -40000 - i * 500,
          normalizedMerchantName: merchant,
        }),
      );
    }

    expect(
      validatePatternCoverage({ pattern, allMerchantTransactions: all }),
    ).toBe(false);
  });

  it("accepts Netflix-style subscription with occasional one-offs (12/14)", () => {
    const merchant = "netflix com";
    const subDates = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(Date.UTC(2024, i, 15));
      return d.toISOString().slice(0, 10);
    });
    const pattern = monthlyPattern(merchant, subDates);

    const all = [
      ...subDates.map((date) =>
        makeTxn({ date, normalizedMerchantName: merchant }),
      ),
      makeTxn({ date: "2024-03-20", amountCents: -50000, normalizedMerchantName: merchant }),
      makeTxn({ date: "2024-08-22", amountCents: -50000, normalizedMerchantName: merchant }),
    ];

    expect(
      validatePatternCoverage({ pattern, allMerchantTransactions: all }),
    ).toBe(true);
  });

  it("accepts at exactly MIN_COVERAGE_RATIO boundary", () => {
    const merchant = "svc";
    const matching = ["2025-01-15", "2025-02-15", "2025-03-15", "2025-04-15"];
    const pattern = monthlyPattern(merchant, matching);

    const all = [
      ...matching.map((date) => makeTxn({ date, normalizedMerchantName: merchant })),
      ...Array.from({ length: 6 }, (_, i) =>
        makeTxn({
          date: `2025-05-${String(i + 1).padStart(2, "0")}`,
          amountCents: -99900,
          normalizedMerchantName: merchant,
        }),
      ),
    ];

    expect(all.length).toBe(10);
    expect(MIN_COVERAGE_RATIO).toBe(0.4);
    expect(
      validatePatternCoverage({
        pattern,
        allMerchantTransactions: all,
        minCoverageRatio: 0.4,
      }),
    ).toBe(true);
  });

  it("rejects one below coverage threshold", () => {
    const merchant = "svc";
    const matching = ["2025-01-15", "2025-02-15", "2025-03-15"];
    const pattern = monthlyPattern(merchant, matching);

    const all = [
      ...matching.map((date) => makeTxn({ date, normalizedMerchantName: merchant })),
      ...Array.from({ length: 7 }, (_, i) =>
        makeTxn({
          date: `2025-05-${String(i + 1).padStart(2, "0")}`,
          amountCents: -99900,
          normalizedMerchantName: merchant,
        }),
      ),
    ];

    expect(
      validatePatternCoverage({
        pattern,
        allMerchantTransactions: all,
        minCoverageRatio: 0.4,
      }),
    ).toBe(false);
  });

  it("skips amount check for volatile patterns", () => {
    const merchant = "power co";
    const dates = ["2025-01-17", "2025-02-18", "2025-03-19", "2025-04-17"];
    const pattern: RecurrenceAnalysis = {
      ...monthlyPattern(merchant, dates, -10000),
      amountTrend: "volatile",
      lastAmounts: dates.map((date, i) => ({
        value: 10000 + i * 5000,
        currency: "NOK",
        date,
      })),
    };

    const all = dates.map((date, i) =>
      makeTxn({
        date,
        amountCents: -(10000 + i * 8000),
        normalizedMerchantName: merchant,
      }),
    );

    expect(
      validatePatternCoverage({ pattern, allMerchantTransactions: all }),
    ).toBe(true);
  });
});
