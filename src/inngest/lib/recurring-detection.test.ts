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
