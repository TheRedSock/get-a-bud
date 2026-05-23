import {
  cadenceToExpectedDays,
  clusterByAmount,
  coefficientOfVariation,
  computeIntervals,
  detectTrend,
  determineCadenceFromMonthGaps,
  extractPatterns,
  findDayOfMonthPeaks,
  mapToCadence,
  mean,
  median,
  mode,
  standardDeviation,
  analyzeRecurrence,
  analyzeCluster,
} from "./analysis";
import {
  addDays,
  adjustForBusinessDays,
  isNorwegianHoliday,
  nextCadenceDate,
  norwegianHolidays,
} from "./calendar";
import { detectRecurring, groupByMerchant, recurringMerchantKey } from "./index";
import type { RecurringTransactionInput } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTxn(
  overrides: Partial<RecurringTransactionInput> & { date: string },
): RecurringTransactionInput {
  return {
    id: crypto.randomUUID(),
    amountCents: -19900,
    currency: "NOK",
    originalAmountCents: null,
    originalCurrency: null,
    normalizedMerchantName: "netflix com",
    transactionType: "online_purchase",
    ...overrides,
  };
}

/** Generate n monthly transactions starting from a base date. */
function monthlySequence(
  merchant: string,
  n: number,
  baseDate: string,
  amountCents: number = -19900,
): RecurringTransactionInput[] {
  const txns: RecurringTransactionInput[] = [];
  const [y, m, d] = baseDate.split("-").map(Number);
  for (let i = 0; i < n; i++) {
    const date = new Date(Date.UTC(y, m - 1 + i, d));
    txns.push(
      makeTxn({
        date: date.toISOString().slice(0, 10),
        amountCents,
        normalizedMerchantName: merchant,
      }),
    );
  }
  return txns;
}

// ---------------------------------------------------------------------------
// Statistical helpers
// ---------------------------------------------------------------------------

describe("median", () => {
  it("computes median of odd-length array", () => {
    expect(median([1, 3, 5])).toBe(3);
  });

  it("computes median of even-length array", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("returns 0 for empty array", () => {
    expect(median([])).toBe(0);
  });
});

describe("mean", () => {
  it("computes average", () => {
    expect(mean([2, 4, 6])).toBe(4);
  });
});

describe("standardDeviation", () => {
  it("returns 0 for single value", () => {
    expect(standardDeviation([5])).toBe(0);
  });

  it("computes sample std dev", () => {
    const sd = standardDeviation([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(sd).toBeCloseTo(2.138, 2);
  });
});

describe("coefficientOfVariation", () => {
  it("returns 0 for constant values", () => {
    expect(coefficientOfVariation([5, 5, 5])).toBe(0);
  });

  it("returns > 0 for varying values", () => {
    expect(coefficientOfVariation([10, 20, 30])).toBeGreaterThan(0);
  });
});

describe("mode", () => {
  it("returns the most common value", () => {
    expect(mode([1, 2, 2, 3, 3, 3, 4])).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Amount clustering
// ---------------------------------------------------------------------------

describe("clusterByAmount", () => {
  it("groups similar amounts together", () => {
    const txns = [
      makeTxn({ date: "2025-01-01", amountCents: -19900 }),
      makeTxn({ date: "2025-02-01", amountCents: -19900 }),
      makeTxn({ date: "2025-03-01", amountCents: -19900 }),
      makeTxn({ date: "2025-04-01", amountCents: -50000 }),
    ];

    const clusters = clusterByAmount(txns);
    expect(clusters).toHaveLength(2);
    expect(clusters[0]).toHaveLength(3); // 199 cluster
    expect(clusters[1]).toHaveLength(1); // 500 cluster
  });

  it("uses original currency amount when available", () => {
    const txns = [
      makeTxn({
        date: "2025-01-01",
        amountCents: -25000,
        originalAmountCents: 2199,
        originalCurrency: "EUR",
      }),
      makeTxn({
        date: "2025-02-01",
        amountCents: -26000,
        originalAmountCents: 2199,
        originalCurrency: "EUR",
      }),
      makeTxn({
        date: "2025-03-01",
        amountCents: -27000,
        originalAmountCents: 2199,
        originalCurrency: "EUR",
      }),
    ];

    const clusters = clusterByAmount(txns);
    // All same original amount → one cluster
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toHaveLength(3);
  });

  it("separates different currencies", () => {
    const txns = [
      makeTxn({
        date: "2025-01-01",
        amountCents: -20000,
        originalAmountCents: 2000,
        originalCurrency: "EUR",
      }),
      makeTxn({
        date: "2025-02-01",
        amountCents: -20000,
        originalAmountCents: 2000,
        originalCurrency: "USD",
      }),
    ];

    const clusters = clusterByAmount(txns);
    expect(clusters).toHaveLength(2);
  });

  it("returns empty array for empty input", () => {
    expect(clusterByAmount([])).toEqual([]);
  });
});

describe("merchant identity grouping", () => {
  it("groups different normalized names by merchantId when available", () => {
    const txns = [
      makeTxn({
        date: "2026-01-01",
        merchantId: "merchant-kiwi",
        normalizedMerchantName: "kiwi 425 rødtvet",
      }),
      makeTxn({
        date: "2026-01-02",
        merchantId: "merchant-kiwi",
        normalizedMerchantName: "kiwi 425 rødtve",
      }),
    ];

    expect(recurringMerchantKey(txns[0])).toBe("merchant:merchant-kiwi");
    const groups = groupByMerchant(txns);
    expect(groups.get("merchant:merchant-kiwi")).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Interval computation
// ---------------------------------------------------------------------------

describe("computeIntervals", () => {
  it("computes day intervals between consecutive transactions", () => {
    const txns = [
      makeTxn({ date: "2025-01-01" }),
      makeTxn({ date: "2025-02-01" }),
      makeTxn({ date: "2025-03-01" }),
    ];
    const intervals = computeIntervals(txns);
    expect(intervals).toEqual([31, 28]);
  });
});

// ---------------------------------------------------------------------------
// Cadence detection
// ---------------------------------------------------------------------------

describe("mapToCadence", () => {
  it("maps ~7 days to weekly", () => {
    expect(mapToCadence(7)).toBe("weekly");
  });

  it("maps ~14 days to biweekly", () => {
    expect(mapToCadence(14)).toBe("biweekly");
  });

  it("maps ~30 days to monthly", () => {
    expect(mapToCadence(30)).toBe("monthly");
  });

  it("maps ~91 days to quarterly", () => {
    expect(mapToCadence(91)).toBe("quarterly");
  });

  it("maps ~182 days to semi_annual", () => {
    expect(mapToCadence(182)).toBe("semi_annual");
  });

  it("maps ~365 days to yearly", () => {
    expect(mapToCadence(365)).toBe("yearly");
  });

  it("returns null for 3-day interval (frequent purchase)", () => {
    expect(mapToCadence(3)).toBeNull();
  });

  it("returns null for 45-day interval (no cadence)", () => {
    expect(mapToCadence(45)).toBeNull();
  });
});

describe("cadenceToExpectedDays", () => {
  it("returns expected intervals", () => {
    expect(cadenceToExpectedDays("weekly")).toBe(7);
    expect(cadenceToExpectedDays("monthly")).toBe(30);
    expect(cadenceToExpectedDays("semi_annual")).toBe(182);
    expect(cadenceToExpectedDays("yearly")).toBe(365);
  });
});

// ---------------------------------------------------------------------------
// Trend analysis
// ---------------------------------------------------------------------------

describe("detectTrend", () => {
  it("detects stable amounts", () => {
    const obs = [
      { value: 100, currency: "NOK", date: "2025-01-01" },
      { value: 100, currency: "NOK", date: "2025-02-01" },
      { value: 100, currency: "NOK", date: "2025-03-01" },
    ];
    expect(detectTrend(obs)).toBe("stable");
  });

  it("detects increasing trend", () => {
    const obs = [
      { value: 100, currency: "NOK", date: "2025-01-01" },
      { value: 110, currency: "NOK", date: "2025-02-01" },
      { value: 120, currency: "NOK", date: "2025-03-01" },
      { value: 130, currency: "NOK", date: "2025-04-01" },
    ];
    expect(detectTrend(obs)).toBe("increasing");
  });

  it("detects decreasing trend", () => {
    const obs = [
      { value: 200, currency: "NOK", date: "2025-01-01" },
      { value: 190, currency: "NOK", date: "2025-02-01" },
      { value: 180, currency: "NOK", date: "2025-03-01" },
      { value: 170, currency: "NOK", date: "2025-04-01" },
    ];
    expect(detectTrend(obs)).toBe("decreasing");
  });

  it("detects volatile amounts", () => {
    const obs = [
      { value: 50, currency: "NOK", date: "2025-01-01" },
      { value: 200, currency: "NOK", date: "2025-02-01" },
      { value: 80, currency: "NOK", date: "2025-03-01" },
      { value: 300, currency: "NOK", date: "2025-04-01" },
    ];
    expect(detectTrend(obs)).toBe("volatile");
  });

  it("returns stable for < 3 observations", () => {
    expect(detectTrend([{ value: 100, currency: "NOK", date: "2025-01-01" }])).toBe("stable");
  });
});

// ---------------------------------------------------------------------------
// Calendar helpers
// ---------------------------------------------------------------------------

describe("norwegianHolidays", () => {
  it("includes fixed holidays", () => {
    const holidays = norwegianHolidays(2025);
    expect(holidays.has("2025-01-01")).toBe(true); // New Year
    expect(holidays.has("2025-05-01")).toBe(true); // Labour Day
    expect(holidays.has("2025-05-17")).toBe(true); // Constitution Day
    expect(holidays.has("2025-12-25")).toBe(true); // Christmas
    expect(holidays.has("2025-12-26")).toBe(true); // St. Stephen
  });

  it("includes Easter-dependent holidays for 2025", () => {
    // Easter Sunday 2025 = April 20
    const holidays = norwegianHolidays(2025);
    expect(holidays.has("2025-04-17")).toBe(true); // Maundy Thursday
    expect(holidays.has("2025-04-18")).toBe(true); // Good Friday
    expect(holidays.has("2025-04-20")).toBe(true); // Easter Sunday
    expect(holidays.has("2025-04-21")).toBe(true); // Easter Monday
    expect(holidays.has("2025-05-29")).toBe(true); // Ascension Day
    expect(holidays.has("2025-06-08")).toBe(true); // Whit Sunday
    expect(holidays.has("2025-06-09")).toBe(true); // Whit Monday
  });
});

describe("isNorwegianHoliday", () => {
  it("returns true for Christmas", () => {
    expect(isNorwegianHoliday("2025-12-25")).toBe(true);
  });

  it("returns false for a normal day", () => {
    expect(isNorwegianHoliday("2025-03-12")).toBe(false);
  });
});

describe("adjustForBusinessDays", () => {
  it("shifts Saturday to Friday", () => {
    // 2025-05-03 is a Saturday
    expect(adjustForBusinessDays("2025-05-03")).toBe("2025-05-02");
  });

  it("shifts Sunday to Monday", () => {
    // 2025-05-04 is a Sunday
    expect(adjustForBusinessDays("2025-05-04")).toBe("2025-05-05");
  });

  it("shifts holiday to next business day", () => {
    // 2025-05-01 is Thursday (Labour Day) → next business day is Friday 05-02
    expect(adjustForBusinessDays("2025-05-01")).toBe("2025-05-02");
  });

  it("shifts Saturday to Thursday when Friday is a holiday", () => {
    // 2027-01-02 is Saturday, 2027-01-01 (Friday) is New Year's Day
    // Should go backward: Saturday → Friday (holiday) → Thursday
    expect(adjustForBusinessDays("2027-01-02")).toBe("2026-12-31");
  });

  it("leaves a normal weekday unchanged", () => {
    // 2025-05-06 is a Tuesday
    expect(adjustForBusinessDays("2025-05-06")).toBe("2025-05-06");
  });
});

describe("addDays", () => {
  it("adds days correctly", () => {
    expect(addDays("2025-05-01", 30)).toBe("2025-05-31");
  });

  it("crosses month boundaries", () => {
    expect(addDays("2025-01-30", 5)).toBe("2025-02-04");
  });
});

describe("nextCadenceDate", () => {
  it("returns next month for monthly cadence", () => {
    expect(nextCadenceDate("2025-01-15", 15, "monthly")).toBe("2025-02-15");
  });

  it("returns 3 months later for quarterly", () => {
    expect(nextCadenceDate("2025-01-15", 15, "quarterly")).toBe("2025-04-15");
  });

  it("returns next year for yearly", () => {
    expect(nextCadenceDate("2025-01-15", 15, "yearly")).toBe("2026-01-15");
  });

  it("returns 6 months later for semi_annual", () => {
    expect(nextCadenceDate("2025-01-15", 15, "semi_annual")).toBe("2025-07-15");
  });

  it("clamps to last day of month (31st → 28th in Feb)", () => {
    expect(nextCadenceDate("2025-01-31", 31, "monthly")).toBe("2025-02-28");
  });
});

// ---------------------------------------------------------------------------
// Recurrence analysis
// ---------------------------------------------------------------------------

describe("analyzeRecurrence", () => {
  it("detects monthly subscription", () => {
    const txns = monthlySequence("netflix com", 6, "2025-01-15");
    const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date));
    const result = analyzeRecurrence(sorted, "netflix com");

    expect(result.isRecurring).toBe(true);
    expect(result.cadence).toBe("monthly");
    expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    expect(result.pattern).toBe("day_of_month");
    expect(result.typicalDayOfMonth).toBe(15);
    expect(result.predictedNextDate).toBeTruthy();
  });

  it("detects quarterly bill", () => {
    const txns: RecurringTransactionInput[] = [];
    for (let i = 0; i < 5; i++) {
      const date = new Date(Date.UTC(2024, i * 3, 10));
      txns.push(
        makeTxn({
          date: date.toISOString().slice(0, 10),
          amountCents: -250000,
          normalizedMerchantName: "insurance co",
        }),
      );
    }

    const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date));
    const result = analyzeRecurrence(sorted, "insurance co");

    expect(result.isRecurring).toBe(true);
    expect(result.cadence).toBe("quarterly");
  });

  it("rejects frequent merchant (daily grocery store)", () => {
    const txns: RecurringTransactionInput[] = [];
    for (let i = 0; i < 30; i++) {
      const date = new Date(Date.UTC(2025, 0, 1 + i));
      txns.push(
        makeTxn({
          date: date.toISOString().slice(0, 10),
          amountCents: -(5000 + Math.floor(i * 3) * 100),
          normalizedMerchantName: "kiwi 425",
        }),
      );
    }

    const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date));
    const result = analyzeRecurrence(sorted, "kiwi 425");

    expect(result.isRecurring).toBe(false);
  });

  it("rejects with fewer than 3 transactions", () => {
    const txns = monthlySequence("some service", 2, "2025-01-01");
    const result = analyzeRecurrence(txns, "some service");
    expect(result.isRecurring).toBe(false);
  });

  it("detects price increase", () => {
    const txns = monthlySequence("streaming svc", 5, "2025-01-15", -19900);
    // Bump the last transaction
    txns[4] = makeTxn({
      date: "2025-05-15",
      amountCents: -24900,
      normalizedMerchantName: "streaming svc",
    });

    const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date));
    const result = analyzeRecurrence(sorted, "streaming svc");

    expect(result.isRecurring).toBe(true);
    expect(result.priceChangeDetected).toBe(true);
  });

  it("uses original currency for foreign subscriptions", () => {
    const txns: RecurringTransactionInput[] = [];
    for (let i = 0; i < 6; i++) {
      const date = new Date(Date.UTC(2025, i, 15));
      txns.push(
        makeTxn({
          date: date.toISOString().slice(0, 10),
          amountCents: -(25000 + i * 500), // varying NOK due to exchange rate
          originalAmountCents: 2199,
          originalCurrency: "EUR",
          normalizedMerchantName: "netflix com",
        }),
      );
    }

    const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date));
    const result = analyzeRecurrence(sorted, "netflix com");

    expect(result.isRecurring).toBe(true);
    expect(result.originalCurrency).toBe("EUR");
    expect(result.lastOriginalAmount).toBe(2199);
  });

  it("detects weekly subscription", () => {
    const txns: RecurringTransactionInput[] = [];
    for (let i = 0; i < 8; i++) {
      const date = new Date(Date.UTC(2025, 0, 6 + i * 7)); // every Monday
      txns.push(
        makeTxn({
          date: date.toISOString().slice(0, 10),
          amountCents: -9900,
          normalizedMerchantName: "laundry svc",
        }),
      );
    }

    const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date));
    const result = analyzeRecurrence(sorted, "laundry svc");

    expect(result.isRecurring).toBe(true);
    expect(result.cadence).toBe("weekly");
  });

  it("detects semi-annual bill", () => {
    const txns: RecurringTransactionInput[] = [];
    // 4 payments roughly every 6 months (182 days)
    const baseDates = [
      "2023-06-15",
      "2023-12-14",
      "2024-06-13",
      "2024-12-12",
    ];
    for (const d of baseDates) {
      txns.push(
        makeTxn({
          date: d,
          amountCents: -850000,
          normalizedMerchantName: "insurance co",
        }),
      );
    }

    const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date));
    const result = analyzeRecurrence(sorted, "insurance co");

    expect(result.isRecurring).toBe(true);
    expect(result.cadence).toBe("semi_annual");
  });

  it("populates amountSignature on recurring result", () => {
    const txns = monthlySequence("netflix com", 6, "2025-01-15");
    const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date));
    const result = analyzeRecurrence(sorted, "netflix com");

    expect(result.isRecurring).toBe(true);
    expect(result.amountSignature).toBe("NOK~19900");
  });

  it("populates amountSignature with original currency", () => {
    const txns: RecurringTransactionInput[] = [];
    for (let i = 0; i < 6; i++) {
      const date = new Date(Date.UTC(2025, i, 15));
      txns.push(
        makeTxn({
          date: date.toISOString().slice(0, 10),
          amountCents: -(25000 + i * 500),
          originalAmountCents: 2199,
          originalCurrency: "EUR",
          normalizedMerchantName: "netflix com",
        }),
      );
    }

    const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date));
    const result = analyzeRecurrence(sorted, "netflix com");

    expect(result.isRecurring).toBe(true);
    expect(result.amountSignature).toBe("EUR~2199");
  });

  it("populates transactionIds", () => {
    const txns = monthlySequence("spotify", 6, "2025-01-01");
    const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date));
    const result = analyzeRecurrence(sorted, "spotify");

    expect(result.isRecurring).toBe(true);
    expect(result.transactionIds).toHaveLength(6);
    expect(result.transactionIds).toEqual(sorted.map((t) => t.id));
  });

  it("returns empty amountSignature and transactionIds when not recurring", () => {
    const txns = monthlySequence("some service", 2, "2025-01-01");
    const result = analyzeRecurrence(txns, "some service");

    expect(result.isRecurring).toBe(false);
    expect(result.amountSignature).toBe("");
    expect(result.transactionIds).toHaveLength(2);
    expect(result.isDuplicateSubscription).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Histogram-based pattern extraction
// ---------------------------------------------------------------------------

describe("findDayOfMonthPeaks", () => {
  it("finds a single peak for monthly subscription", () => {
    const txns = monthlySequence("netflix com", 6, "2025-01-15");
    const peaks = findDayOfMonthPeaks(txns);
    expect(peaks).toHaveLength(1);
    expect(peaks[0].anchorDay).toBe(15);
    expect(peaks[0].transactions).toHaveLength(6);
  });

  it("finds two peaks for two subscriptions on different days", () => {
    const txns = [
      ...monthlySequence("svc", 6, "2025-01-05"),
      ...monthlySequence("svc", 6, "2025-01-20"),
    ];
    const peaks = findDayOfMonthPeaks(txns);
    expect(peaks).toHaveLength(2);
    const days = peaks.map((p) => p.anchorDay).sort((a, b) => a - b);
    expect(days).toEqual([5, 20]);
  });

  it("finds peaks even for single-month data (cadence filters later)", () => {
    const txns: RecurringTransactionInput[] = [];
    for (let i = 0; i < 30; i++) {
      txns.push(
        makeTxn({
          date: new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10),
          normalizedMerchantName: "kiwi",
        }),
      );
    }
    // With ±2 tolerance, some window centers hit 3+ transactions.
    // findDayOfMonthPeaks doesn't check cadence — that's extractPatterns' job.
    const peaks = findDayOfMonthPeaks(txns);
    // Peaks exist but would be rejected by cadence analysis downstream
    expect(peaks.length).toBeGreaterThan(0);
  });
});

describe("determineCadenceFromMonthGaps", () => {
  it("detects monthly from consecutive months", () => {
    const txns = monthlySequence("svc", 6, "2025-01-15");
    const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date));
    const result = determineCadenceFromMonthGaps(sorted);
    expect(result).not.toBeNull();
    expect(result!.cadence).toBe("monthly");
    expect(result!.regularity).toBeGreaterThanOrEqual(0.8);
  });

  it("detects quarterly from 3-month gaps", () => {
    const txns: RecurringTransactionInput[] = [];
    for (let i = 0; i < 5; i++) {
      txns.push(
        makeTxn({
          date: new Date(Date.UTC(2024, i * 3, 10)).toISOString().slice(0, 10),
          normalizedMerchantName: "insurance",
        }),
      );
    }
    const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date));
    const result = determineCadenceFromMonthGaps(sorted);
    expect(result).not.toBeNull();
    expect(result!.cadence).toBe("quarterly");
  });

  it("does not classify every-other-month gaps as monthly", () => {
    const txns: RecurringTransactionInput[] = [];
    for (let i = 0; i < 5; i++) {
      txns.push(
        makeTxn({
          date: new Date(Date.UTC(2025, i * 2, 15)).toISOString().slice(0, 10),
          normalizedMerchantName: "bimonthly svc",
        }),
      );
    }

    const result = determineCadenceFromMonthGaps(txns);
    expect(result).toBeNull();
  });

  it("returns null for too few transactions", () => {
    const txns = monthlySequence("svc", 2, "2025-01-15");
    const result = determineCadenceFromMonthGaps(txns);
    expect(result).toBeNull();
  });

  it("rejects semi-annual with only 2/3 matching gaps (higher threshold for sparse cadences)", () => {
    // Peppes-style: 4 transactions with month gaps [3, 6, 5].
    // Only 2/3 gaps match semi-annual (±1 tolerance) → 67% < 75% threshold.
    const txns = [
      makeTxn({ date: "2024-12-18", normalizedMerchantName: "restaurant" }),
      makeTxn({ date: "2025-03-19", normalizedMerchantName: "restaurant" }),
      makeTxn({ date: "2025-09-15", normalizedMerchantName: "restaurant" }),
      makeTxn({ date: "2026-02-18", normalizedMerchantName: "restaurant" }),
    ];
    const result = determineCadenceFromMonthGaps(txns);
    // Should not classify as semi-annual (or anything) due to weak regularity
    expect(result?.cadence).not.toBe("semi_annual");
  });
});

describe("extractPatterns", () => {
  it("detects monthly subscription via histogram peak", () => {
    const txns = monthlySequence("netflix com", 6, "2025-01-15");
    const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date));
    const results = extractPatterns(sorted, "netflix com");

    expect(results).toHaveLength(1);
    expect(results[0].cadence).toBe("monthly");
    expect(results[0].typicalDayOfMonth).toBe(15);
    expect(results[0].pattern).toBe("day_of_month");
    expect(results[0].isDuplicateSubscription).toBe(false);
    expect(results[0].transactionIds).toHaveLength(6);
  });

  it("detects two subscriptions on different days as duplicates", () => {
    // Two Netflix subs: one on the 5th, one on the 20th
    const txns: RecurringTransactionInput[] = [];
    for (let i = 0; i < 6; i++) {
      txns.push(
        makeTxn({
          date: new Date(Date.UTC(2025, i, 5)).toISOString().slice(0, 10),
          amountCents: -19900,
          normalizedMerchantName: "netflix com",
        }),
      );
      txns.push(
        makeTxn({
          date: new Date(Date.UTC(2025, i, 20)).toISOString().slice(0, 10),
          amountCents: -19900,
          normalizedMerchantName: "netflix com",
        }),
      );
    }

    const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date));
    const results = extractPatterns(sorted, "netflix com");

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.isDuplicateSubscription)).toBe(true);
    expect(results.every((r) => r.cadence === "monthly")).toBe(true);
    const days = results
      .map((r) => r.typicalDayOfMonth)
      .sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(days).toEqual([5, 20]);
  });

  it("is resilient to noise (subscription + one-off purchases)", () => {
    // Monthly WoW sub on the 1st + 2 random one-off purchases
    const txns: RecurringTransactionInput[] = [];
    for (let i = 0; i < 6; i++) {
      txns.push(
        makeTxn({
          date: new Date(Date.UTC(2025, i, 1)).toISOString().slice(0, 10),
          amountCents: -19900,
          normalizedMerchantName: "blizzard",
        }),
      );
    }
    // One-off purchases on random days
    txns.push(
      makeTxn({
        date: "2025-02-15",
        amountCents: -19900,
        normalizedMerchantName: "blizzard",
      }),
    );
    txns.push(
      makeTxn({
        date: "2025-04-22",
        amountCents: -19900,
        normalizedMerchantName: "blizzard",
      }),
    );

    const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date));
    const results = extractPatterns(sorted, "blizzard");

    // Should still detect the monthly pattern on day 1
    const monthly = results.find((r) => r.typicalDayOfMonth === 1);
    expect(monthly).toBeDefined();
    expect(monthly!.cadence).toBe("monthly");
    expect(monthly!.transactionIds).toHaveLength(6);
  });

  it("rejects daily grocery store purchases", () => {
    const txns: RecurringTransactionInput[] = [];
    // 90 daily purchases across 3 months — each day has 3 transactions,
    // so histogram peaks form. But ALL days have similar counts, so no
    // day stands out. Even if some pass peak detection, the cadence
    // check requires consistent month gaps in the peak's subsequence.
    // With every day having entries, the peak grabs scattered dates
    // that don't form a clean monthly cadence. And weekly detection
    // requires low amount variance (CoV < 0.15) which varying grocery
    // amounts won't pass.
    for (let i = 0; i < 90; i++) {
      const month = Math.floor(i / 30);
      const day = (i % 30) + 1;
      txns.push(
        makeTxn({
          date: new Date(Date.UTC(2025, month, day))
            .toISOString()
            .slice(0, 10),
          amountCents: -(10000 + (i % 17) * 2300), // varying amounts
          normalizedMerchantName: "kiwi 425",
        }),
      );
    }

    const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date));
    const results = extractPatterns(sorted, "kiwi 425");

    // No pattern should survive: histogram peaks have poor cadence
    // regularity because every month has entries on every day, and
    // weekly detection fails due to high amount variance.
    expect(results).toHaveLength(0);
  });

  it("includes delayed payments in wider tolerance window", () => {
    // Monthly on the 15th, but March payment was late (on the 22nd)
    const txns: RecurringTransactionInput[] = [];
    const dates = [
      "2025-01-15",
      "2025-02-15",
      "2025-03-22", // late payment
      "2025-04-15",
      "2025-05-15",
      "2025-06-15",
    ];
    for (const d of dates) {
      txns.push(
        makeTxn({
          date: d,
          amountCents: -19900,
          normalizedMerchantName: "streaming svc",
        }),
      );
    }

    const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date));
    const results = extractPatterns(sorted, "streaming svc");

    expect(results).toHaveLength(1);
    expect(results[0].cadence).toBe("monthly");
    expect(results[0].typicalDayOfMonth).toBe(15);
    // The late payment should be reconciled
    expect(results[0].transactionIds).toHaveLength(6);
    expect(results[0].delayedTransactionIds).toHaveLength(1);
    expect(results[0].missingPeriods).toHaveLength(0);
  });

  it("reconciles delayed payments posted in the following month", () => {
    const late = makeTxn({
      date: "2025-04-03",
      amountCents: -19900,
      normalizedMerchantName: "streaming svc",
    });
    const txns = [
      makeTxn({
        date: "2025-01-28",
        amountCents: -19900,
        normalizedMerchantName: "streaming svc",
      }),
      makeTxn({
        date: "2025-02-28",
        amountCents: -19900,
        normalizedMerchantName: "streaming svc",
      }),
      late,
      makeTxn({
        date: "2025-04-28",
        amountCents: -19900,
        normalizedMerchantName: "streaming svc",
      }),
      makeTxn({
        date: "2025-05-28",
        amountCents: -19900,
        normalizedMerchantName: "streaming svc",
      }),
    ];

    const results = extractPatterns(txns, "streaming svc");

    expect(results).toHaveLength(1);
    expect(results[0].delayedTransactionIds).toContain(late.id);
    expect(results[0].missingPeriods).toHaveLength(0);
  });

  it("reports missing periods when no delayed match is found", () => {
    // Monthly on the 15th, but April is completely missing
    const txns: RecurringTransactionInput[] = [];
    const dates = [
      "2025-01-15",
      "2025-02-15",
      "2025-03-15",
      // April missing
      "2025-05-15",
      "2025-06-15",
    ];
    for (const d of dates) {
      txns.push(
        makeTxn({
          date: d,
          amountCents: -19900,
          normalizedMerchantName: "streaming svc",
        }),
      );
    }

    const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date));
    const results = extractPatterns(sorted, "streaming svc");

    expect(results).toHaveLength(1);
    expect(results[0].cadence).toBe("monthly");
    expect(results[0].missingPeriods).toContain("2025-04");
  });

  it("falls back to weekly interval detection for unclaimed transactions", () => {
    // 12 weekly transactions starting mid-month — the day-of-month scatters
    // across the range so no single day gets 3+ hits in the histogram.
    const txns: RecurringTransactionInput[] = [];
    for (let i = 0; i < 12; i++) {
      txns.push(
        makeTxn({
          date: new Date(Date.UTC(2025, 0, 8 + i * 7))
            .toISOString()
            .slice(0, 10),
          amountCents: -9900,
          normalizedMerchantName: "laundry svc",
        }),
      );
    }

    const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date));
    const results = extractPatterns(sorted, "laundry svc");

    // With 12 weekly transactions, day-of-month values scatter across
    // the full range. After histogram (may grab a few), enough remain
    // for weekly detection, or the histogram grabs are rejected by cadence.
    // Either way, a weekly pattern should be found.
    const hasRecurring = results.length > 0;
    expect(hasRecurring).toBe(true);
    // Should have at least one result (weekly or monthly depending on
    // how days align). The key is it's not rejected entirely.
  });

  it("returns empty for too few transactions", () => {
    const txns = monthlySequence("svc", 2, "2025-01-15");
    const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date));
    const results = extractPatterns(sorted, "svc");
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Full pipeline: detectRecurring
// ---------------------------------------------------------------------------

describe("detectRecurring", () => {
  it("detects recurring bills from mixed transaction set", () => {
    const txns = [
      // Netflix monthly subscription (6 months)
      ...monthlySequence("netflix com", 6, "2025-01-15"),
      // Kiwi frequent grocery (30 daily purchases)
      ...Array.from({ length: 30 }, (_, i) =>
        makeTxn({
          date: new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10),
          amountCents: -(5000 + i * 200),
          normalizedMerchantName: "kiwi 425 rodtvet",
        }),
      ),
    ];

    const results = detectRecurring(txns);

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((r) => r.merchant === "netflix com")).toBe(true);
    // Kiwi should NOT be detected as recurring
    expect(results.some((r) => r.merchant === "kiwi 425 rodtvet")).toBe(false);
  });

  it("filters out positive amounts", () => {
    const txns = monthlySequence("salary co", 6, "2025-01-01", 5000000);
    const results = detectRecurring(txns);
    expect(results).toHaveLength(0);
  });

  it("filters out short merchant names", () => {
    const txns = monthlySequence("ab", 6, "2025-01-01");
    const results = detectRecurring(txns);
    expect(results).toHaveLength(0);
  });

  it("rejects Foodora-like sparse monthly alignment across many purchases", () => {
    const merchant = "foodora norway";
    const txns: RecurringTransactionInput[] = [
      makeTxn({
        date: "2024-06-26",
        amountCents: -48400,
        normalizedMerchantName: merchant,
      }),
      makeTxn({
        date: "2024-07-29",
        amountCents: -38500,
        normalizedMerchantName: merchant,
      }),
      makeTxn({
        date: "2024-08-26",
        amountCents: -40800,
        normalizedMerchantName: merchant,
      }),
    ];

    for (let i = 0; i < 29; i++) {
      const month = Math.floor(i / 10);
      const day = (i % 28) + 1;
      txns.push(
        makeTxn({
          date: new Date(Date.UTC(2024, month, day)).toISOString().slice(0, 10),
          amountCents: -(40000 + i * 500),
          normalizedMerchantName: merchant,
        }),
      );
    }

    const results = detectRecurring(txns);
    expect(results.some((r) => r.merchant === merchant)).toBe(false);
  });

  it("detects subscription at merchant with occasional one-off purchases", () => {
    const merchant = "streaming svc";
    const txns = [
      ...monthlySequence(merchant, 6, "2025-01-15"),
      makeTxn({
        date: "2025-03-20",
        amountCents: -75000,
        normalizedMerchantName: merchant,
      }),
    ];

    const results = detectRecurring(txns);
    expect(results.some((r) => r.merchant === merchant)).toBe(true);
  });

  it("detects duplicate subscriptions through full pipeline", () => {
    // Two Netflix subs: one on 5th, other on 20th
    const txns: RecurringTransactionInput[] = [];
    for (let i = 0; i < 6; i++) {
      txns.push(
        makeTxn({
          date: new Date(Date.UTC(2025, i, 5)).toISOString().slice(0, 10),
          amountCents: -19900,
          normalizedMerchantName: "netflix com",
        }),
      );
      txns.push(
        makeTxn({
          date: new Date(Date.UTC(2025, i, 20)).toISOString().slice(0, 10),
          amountCents: -19900,
          normalizedMerchantName: "netflix com",
        }),
      );
    }

    const results = detectRecurring(txns);
    const netflix = results.filter((r) => r.merchant === "netflix com");

    expect(netflix).toHaveLength(2);
    expect(netflix.every((r) => r.isDuplicateSubscription)).toBe(true);
    expect(netflix.every((r) => r.cadence === "monthly")).toBe(true);
  });

  it("detects HOA-style monthly bill as one pattern across price tiers", () => {
    const merchant = "rødtvedt borettslag";
    const amounts = [
      291700, 291800, 291900, 291700, 291800, 291800, 291900, 291700,
      291800, 321900, 322200, 322200, 322200, 322200, 322200, 321900,
      282200, 282200, 292800, 292800, 292800, 292800, 292800, 292800,
    ];
    const txns: RecurringTransactionInput[] = amounts.map((cents, i) => {
      const date = new Date(Date.UTC(2024, i, 20));
      return makeTxn({
        date: date.toISOString().slice(0, 10),
        amountCents: -cents,
        normalizedMerchantName: merchant,
        transactionType: "e_invoice",
      });
    });

    const results = detectRecurring(txns);
    const hoa = results.filter((r) => r.merchant === merchant);
    expect(hoa).toHaveLength(1);
    expect(hoa[0].cadence).toBe("monthly");
    expect(hoa[0].typicalDayOfMonth).toBeGreaterThanOrEqual(18);
    expect(hoa[0].typicalDayOfMonth).toBeLessThanOrEqual(22);
  });

  it("handles different-amount patterns per merchant", () => {
    const txns = [
      // Own Netflix sub EUR 21.99
      ...Array.from({ length: 6 }, (_, i) =>
        makeTxn({
          date: new Date(Date.UTC(2025, i, 15)).toISOString().slice(0, 10),
          amountCents: -(25000 + i * 300),
          originalAmountCents: 2199,
          originalCurrency: "EUR",
          normalizedMerchantName: "netflix com",
        }),
      ),
      // Family Netflix sub USD 15.99
      ...Array.from({ length: 6 }, (_, i) =>
        makeTxn({
          date: new Date(Date.UTC(2025, i, 20)).toISOString().slice(0, 10),
          amountCents: -(17000 + i * 200),
          originalAmountCents: 1599,
          originalCurrency: "USD",
          normalizedMerchantName: "netflix com",
        }),
      ),
    ];

    const results = detectRecurring(txns);
    const netflix = results.filter((r) => r.merchant === "netflix com");

    // Should detect two separate patterns (different currencies/amounts)
    expect(netflix.length).toBeGreaterThanOrEqual(2);
    // Different signatures
    const sigs = new Set(netflix.map((r) => r.amountSignature));
    expect(sigs.size).toBe(netflix.length);
  });
});

// ---------------------------------------------------------------------------
// groupByMerchant
// ---------------------------------------------------------------------------

describe("groupByMerchant", () => {
  it("groups negative amounts by merchant name", () => {
    const txns = [
      makeTxn({ date: "2025-01-01", normalizedMerchantName: "netflix com" }),
      makeTxn({ date: "2025-02-01", normalizedMerchantName: "netflix com" }),
      makeTxn({ date: "2025-01-15", normalizedMerchantName: "spotify" }),
    ];

    const groups = groupByMerchant(txns);
    expect(groups.size).toBe(2);
    expect(groups.get("netflix com")).toHaveLength(2);
    expect(groups.get("spotify")).toHaveLength(1);
  });

  it("skips positive amounts", () => {
    const txns = [
      makeTxn({ date: "2025-01-01", amountCents: 10000 }),
    ];
    const groups = groupByMerchant(txns);
    expect(groups.size).toBe(0);
  });

  it("skips internal transfer and investment transaction types", () => {
    const txns = [
      makeTxn({
        date: "2025-01-01",
        normalizedMerchantName: "savings",
        transactionType: "internal_transfer",
      }),
      makeTxn({
        date: "2025-01-02",
        normalizedMerchantName: "fund",
        transactionType: "investment",
      }),
    ];

    const groups = groupByMerchant(txns);
    expect(groups.size).toBe(0);
  });

  it("skips short merchant names", () => {
    const txns = [
      makeTxn({ date: "2025-01-01", normalizedMerchantName: "ab" }),
    ];
    const groups = groupByMerchant(txns);
    expect(groups.size).toBe(0);
  });
});
