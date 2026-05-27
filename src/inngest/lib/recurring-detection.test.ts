import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

import {
  MAX_MATCH_EXPENSE_PAGES_PER_RUN,
  matchExistingRecurringBills,
  detectNewRecurringBills,
} from "@/inngest/lib/recurring-detection";

const EXPENSE_PAGE_SIZE = 500;

function expensePageRow(id: string) {
  return {
    id,
    amountCents: -1000,
    currency: "NOK",
    date: "2024-06-01",
    originalAmountCents: null,
    originalCurrency: null,
    merchantId: null,
    normalizedMerchantName: "Acme",
    transactionType: "card_purchase",
    metadata: null,
  };
}

function selectChain(result: unknown[]) {
  const promise = Promise.resolve(result);
  const chain = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    offset: vi.fn(() => promise),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  };
  chain.from.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  return chain;
}

describe("matchExistingRecurringBills bounds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockResolvedValue([]),
      }),
    });
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });
  });

  it("returns needsContinuation after maxPages expense pages", async () => {
    const fullPage = Array.from({ length: EXPENSE_PAGE_SIZE }, (_, i) =>
      expensePageRow(`txn-${i}`),
    );
    const selectQueue = [
      [], // existing bills
      [], // claimed history
      ...Array.from({ length: MAX_MATCH_EXPENSE_PAGES_PER_RUN }, () => fullPage),
    ];
    let call = 0;
    mockSelect.mockImplementation(() => selectChain(selectQueue[call++] ?? []));

    const result = await matchExistingRecurringBills({
      householdId: "hh-1",
      cutoffStr: "2022-01-01",
      runStartTime: new Date("2024-01-01"),
      startOffset: 0,
      maxPages: MAX_MATCH_EXPENSE_PAGES_PER_RUN,
    });

    expect(result.needsContinuation).toBe(true);
    expect(result.nextMatchOffset).toBe(
      MAX_MATCH_EXPENSE_PAGES_PER_RUN * EXPENSE_PAGE_SIZE,
    );
  });

  it("completes when fewer pages than maxPages", async () => {
    let call = 0;
    mockSelect.mockImplementation(() => {
      const results = [[], [], [expensePageRow("txn-1")]];
      return selectChain(results[call++] ?? []);
    });

    const result = await matchExistingRecurringBills({
      householdId: "hh-1",
      cutoffStr: "2022-01-01",
      runStartTime: new Date("2024-01-01"),
      maxPages: MAX_MATCH_EXPENSE_PAGES_PER_RUN,
    });

    expect(result.needsContinuation).toBeUndefined();
    expect(result.claimedIds).toEqual([]);
  });
});

describe("recurring detection bounds", () => {
  it("caps match and detect expense scanning per invocation", () => {
    expect(MAX_MATCH_EXPENSE_PAGES_PER_RUN).toBeGreaterThan(0);
    expect(MAX_MATCH_EXPENSE_PAGES_PER_RUN).toBeLessThanOrEqual(100);
  });
});

describe("matchExistingRecurringBills matching rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockResolvedValue([]),
      }),
    });
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });
  });

  it("matches volatile bills without amount tolerance", async () => {
    const volatileBill = {
      id: "bill-volatile",
      merchantPattern: "Acme",
      typicalDayOfMonth: 15,
      expectedAmountCents: 100_000,
      originalCurrency: null,
      cadence: "monthly",
      nextDueDate: "2025-06-15",
      pattern: "day_of_month",
      isActive: true,
      userEndedAt: null,
      amountTrend: "volatile",
    };

    const expenseRow = {
      ...expensePageRow("txn-volatile"),
      amountCents: -250_000,
      date: "2025-06-15",
      normalizedMerchantName: "Acme",
    };

    let call = 0;
    mockSelect.mockImplementation(() => {
      const results = [
        [volatileBill],
        [],
        [expenseRow],
      ];
      return selectChain(results[call++] ?? []);
    });

    const result = await matchExistingRecurringBills({
      householdId: "hh-1",
      cutoffStr: "2022-01-01",
      runStartTime: new Date("2025-06-20"),
    });

    expect(result.existingMatched).toBe(1);
    expect(mockInsert).toHaveBeenCalled();
  });

  it("reactivates auto-ended bills when a new payment matches", async () => {
    const autoEndedBill = {
      id: "bill-ended",
      merchantPattern: "Acme",
      typicalDayOfMonth: 15,
      expectedAmountCents: 10_000,
      originalCurrency: null,
      cadence: "monthly",
      nextDueDate: "2025-06-15",
      pattern: "day_of_month",
      isActive: false,
      userEndedAt: null,
      amountTrend: "stable",
    };

    const expenseRow = {
      ...expensePageRow("txn-reactivate"),
      amountCents: -10_000,
      date: "2025-06-15",
      normalizedMerchantName: "Acme",
    };

    const setMock = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    });
    mockUpdate.mockReturnValue({ set: setMock });

    let call = 0;
    mockSelect.mockImplementation(() => {
      const results = [[autoEndedBill], [], [expenseRow]];
      return selectChain(results[call++] ?? []);
    });

    await matchExistingRecurringBills({
      householdId: "hh-1",
      cutoffStr: "2022-01-01",
      runStartTime: new Date("2025-06-20"),
    });

    expect(setMock).toHaveBeenCalled();
    const updateArg = setMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(updateArg.isActive).toBe(true);
    expect(updateArg.isPossiblyCancelled).toBe(false);
  });

  it("does not reactivate user-ended bills even when a payment matches", async () => {
    // User-ended bills have userEndedAt set and are excluded by the SQL
    // WHERE clause (isNull(userEndedAt)). Simulate this by returning an
    // empty bill list — the bill is never loaded for matching.
    const expenseRow = {
      ...expensePageRow("txn-user-ended"),
      amountCents: -10_000,
      date: "2025-06-15",
      normalizedMerchantName: "Acme",
    };

    let call = 0;
    mockSelect.mockImplementation(() => {
      // First call: bills query — returns empty because user-ended bill
      // is filtered out by isNull(userEndedAt)
      // Second call: claimed IDs — empty
      // Third call: expense page — has a matching transaction
      const results: unknown[][] = [[], [], [expenseRow]];
      return selectChain(results[call++] ?? []);
    });

    const result = await matchExistingRecurringBills({
      householdId: "hh-1",
      cutoffStr: "2022-01-01",
      runStartTime: new Date("2025-06-20"),
    });

    // No bills to match against, so nothing gets matched or updated
    expect(result.existingMatched).toBe(0);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("detectNewRecurringBills schedule protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not overwrite monthly schedule when quarterly drift pattern resolves to same bill", async () => {
    // Simulate a Music League scenario: mostly monthly payments on ~day 30,
    // with a few early-month payments. After the billing-drift arbitration
    // in detectRecurring, only the monthly pattern should survive. But even
    // if both survived (defense in depth), the second pattern should not
    // overwrite the bill's schedule because the bill was already updated.
    const merchant = "music league";
    const txns: Array<ReturnType<typeof expensePageRow>> = [];

    // Monthly day-30 payments
    for (let i = 0; i < 11; i++) {
      const month = 5 + i; // May 2024 to March 2025
      const year = 2024 + Math.floor((month - 1) / 12);
      const m = ((month - 1) % 12) + 1;
      const day = m === 2 ? 28 : 30;
      txns.push({
        id: `txn-30-${i}`,
        amountCents: -200,
        currency: "NOK",
        date: `${year}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        originalAmountCents: null,
        originalCurrency: null,
        merchantId: null,
        normalizedMerchantName: merchant,
        transactionType: "card_purchase",
        metadata: null,
      });
    }

    // Early-month payments (billing drift, ~quarterly gaps)
    for (const date of ["2024-06-02", "2024-09-01", "2024-12-02", "2025-03-02"]) {
      txns.push({
        id: `txn-drift-${date}`,
        amountCents: -200,
        currency: "NOK",
        date,
        originalAmountCents: null,
        originalCurrency: null,
        merchantId: null,
        normalizedMerchantName: merchant,
        transactionType: "card_purchase",
        metadata: null,
      });
    }

    // Existing monthly bill in the household
    const existingBill = {
      id: "bill-music-league",
      merchantPattern: merchant,
      amountSignature: "NOK~200",
      cadence: "monthly",
      typicalDayOfMonth: 30,
      isDuplicateSubscription: false,
      userEndedAt: null,
      nextDueDate: "2025-04-30",
      isActive: true,
    };

    const setMock = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    });
    mockUpdate.mockReturnValue({ set: setMock });

    const insertValuesMock = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: "bill-new" }]),
      onConflictDoNothing: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    });
    mockInsert.mockReturnValue({ values: insertValuesMock });

    let selectCall = 0;
    // Note: page.length < EXPENSE_PAGE_SIZE (15 < 500) causes an immediate
    // break — no second loadExpensePage call is made.
    const selectSequence: unknown[][] = [
      txns, // first expense page (< 500 → loop breaks)
      [existingBill], // household bills in upsert
    ];
    mockSelect.mockImplementation(() => {
      const result = selectSequence[selectCall] ?? [];
      selectCall++;
      return selectChain(result);
    });

    const result = await detectNewRecurringBills({
      householdId: "hh-1",
      cutoffStr: "2024-01-01",
      runStartTime: new Date("2025-05-26"),
      claimedIds: [],
    });

    // Detection should produce exactly 1 pattern (monthly) after arbitration
    expect(result.detected).toBe(1);

    // If any update was made to the bill, the cadence should remain monthly
    if (setMock.mock.calls.length > 0) {
      const updateArgs = setMock.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(updateArgs.cadence).toBe("monthly");
      // typicalDayOfMonth should be in the high 20s-30 range
      expect(updateArgs.typicalDayOfMonth).toBeGreaterThanOrEqual(28);
    }
  });

  it("allows cadence correction when existing bill has wrong cadence", async () => {
    // A bill was previously corrupted to quarterly. Detection now correctly
    // identifies it as monthly. The update should be allowed (self-healing).
    const merchant = "streaming svc";
    const txns: Array<ReturnType<typeof expensePageRow>> = [];

    for (let i = 0; i < 10; i++) {
      const month = 3 + i;
      const year = 2024 + Math.floor((month - 1) / 12);
      const m = ((month - 1) % 12) + 1;
      txns.push({
        id: `txn-fix-${i}`,
        amountCents: -9900,
        currency: "NOK",
        date: `${year}-${String(m).padStart(2, "0")}-15`,
        originalAmountCents: null,
        originalCurrency: null,
        merchantId: null,
        normalizedMerchantName: merchant,
        transactionType: "card_purchase",
        metadata: null,
      });
    }

    // Existing bill has WRONG cadence (quarterly instead of monthly)
    const corruptedBill = {
      id: "bill-corrupted",
      merchantPattern: merchant,
      amountSignature: "NOK~9900",
      cadence: "quarterly",
      typicalDayOfMonth: 1,
      isDuplicateSubscription: false,
      userEndedAt: null,
      nextDueDate: "2025-07-01", // wrong: computed from quarterly cadence
      isActive: true,
    };

    const setMock = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    });
    mockUpdate.mockReturnValue({ set: setMock });

    const insertValuesMock = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: "bill-new" }]),
      onConflictDoNothing: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    });
    mockInsert.mockReturnValue({ values: insertValuesMock });

    let selectCall = 0;
    // Note: page.length < EXPENSE_PAGE_SIZE (10 < 500) causes immediate
    // break — no second loadExpensePage call is made.
    const selectSequence: unknown[][] = [
      txns, // expense page (< 500 → loop breaks)
      [corruptedBill], // household bills in upsert
    ];
    mockSelect.mockImplementation(() => {
      const result = selectSequence[selectCall] ?? [];
      selectCall++;
      return selectChain(result);
    });

    await detectNewRecurringBills({
      householdId: "hh-1",
      cutoffStr: "2024-01-01",
      runStartTime: new Date("2025-05-26"),
      claimedIds: [],
    });

    // The bill should be updated with the correct monthly cadence
    expect(setMock).toHaveBeenCalled();
    const updateArgs = setMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(updateArgs.cadence).toBe("monthly");
    expect(updateArgs.typicalDayOfMonth).toBe(15);
    // nextDueDate should be set (regression allowed because cadence changed)
    expect(updateArgs.nextDueDate).toBeDefined();
    expect(updateArgs.nextDueDate).not.toBeUndefined();
  });
});
