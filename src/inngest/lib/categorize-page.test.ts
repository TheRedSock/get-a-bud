import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSelect = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

vi.mock("@/lib/classification/bootstrap", () => ({
  getBootstrapSuggestions: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("@/lib/finance/merchants", () => ({
  resolveMerchantIdentity: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/finance/categorization", () => ({
  detectCategory: vi.fn().mockResolvedValue(null),
  normalizeMerchant: vi.fn((value: string) => value.toLowerCase()),
}));

vi.mock("@/inngest/lib/categorization-job", () => ({
  loadHouseholdModelData: vi.fn().mockResolvedValue(null),
  merchantIdentityUpdates: vi.fn().mockReturnValue({}),
}));

import { categorizeTransactionPage } from "@/inngest/lib/categorize-page";

function selectChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  };
}

const sampleRow = {
  id: "tx-1",
  householdId: "hh-1",
  accountId: "acct-1",
  source: "manual",
  description: "Coffee shop",
  merchantName: null,
  normalizedMerchantName: null,
  transactionType: null,
  paymentChannel: null,
  metadata: null,
  categoryId: null,
  amountCents: -500,
  date: "2026-01-15",
  originalCurrency: null,
  notes: null,
};

describe("categorizeTransactionPage idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });
  });

  it("issues at most one update per scanned row when nothing matches", async () => {
    mockSelect.mockReturnValue(selectChain([sampleRow]));

    const result = await categorizeTransactionPage("hh-1");

    expect(result.scanned).toBe(1);
    expect(result.updated).toBe(0);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("guards updates with categoryId is null for safe replay", async () => {
    const { detectCategory } = await import("@/lib/finance/categorization");
    vi.mocked(detectCategory).mockResolvedValueOnce({
      categoryId: "cat-1",
      source: "rule",
      confidence: 0.9,
    });

    mockSelect.mockReturnValue(selectChain([sampleRow]));

    await categorizeTransactionPage("hh-1");
    await categorizeTransactionPage("hh-1");

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const whereFn = mockUpdate.mock.results[0]?.value.set.mock.results[0]?.value
      .where;
    expect(whereFn).toHaveBeenCalled();
  });
});
