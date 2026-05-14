import {
  AUTO_EXCLUDE_TYPES,
  findOneSidedTransfers,
  findTransferMatches,
  isTransferCandidate,
  transferGroupIdForPair,
  type TransferCandidate,
} from "./index";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCandidate(
  overrides: Partial<TransferCandidate> & { id: string },
): TransferCandidate {
  return {
    householdId: "hh-1",
    accountId: "acc-checking",
    amount: "-5000.00",
    currency: "NOK",
    date: "2025-05-01",
    transactionType: "internal_transfer",
    transferGroupId: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// findTransferMatches
// ---------------------------------------------------------------------------

describe("findTransferMatches", () => {
  it("links exact amount + same date with confidence 0.95", () => {
    const candidates = [
      makeCandidate({ id: "t1", accountId: "acc-a", amount: "-5000.00" }),
      makeCandidate({ id: "t2", accountId: "acc-b", amount: "5000.00" }),
    ];

    const matches = findTransferMatches(candidates);
    expect(matches).toHaveLength(1);
    expect(matches[0].confidence).toBe(0.95);
    expect(matches[0].autoConfirm).toBe(true);
    expect(matches[0].sourceId).toBe("t1");
    expect(matches[0].destinationId).toBe("t2");
    expect(matches[0].groupId).toBe(transferGroupIdForPair("t1", "t2"));
  });

  it("uses deterministic group IDs for replay-safe background jobs", () => {
    const candidates = [
      makeCandidate({ id: "source", accountId: "acc-a", amount: "-5000.00" }),
      makeCandidate({ id: "destination", accountId: "acc-b", amount: "5000.00" }),
    ];

    expect(findTransferMatches(candidates)[0].groupId).toBe(
      findTransferMatches(candidates)[0].groupId,
    );
  });

  it("links exact amount + 1 day offset with confidence 0.85", () => {
    const candidates = [
      makeCandidate({
        id: "t1",
        accountId: "acc-a",
        amount: "-3000.00",
        date: "2025-05-01",
      }),
      makeCandidate({
        id: "t2",
        accountId: "acc-b",
        amount: "3000.00",
        date: "2025-05-02",
      }),
    ];

    const matches = findTransferMatches(candidates);
    expect(matches).toHaveLength(1);
    expect(matches[0].confidence).toBe(0.85);
    expect(matches[0].autoConfirm).toBe(true);
  });

  it("links exact amount + 2 day offset with confidence 0.70", () => {
    const candidates = [
      makeCandidate({
        id: "t1",
        accountId: "acc-a",
        amount: "-1000.00",
        date: "2025-05-01",
      }),
      makeCandidate({
        id: "t2",
        accountId: "acc-b",
        amount: "1000.00",
        date: "2025-05-03",
      }),
    ];

    const matches = findTransferMatches(candidates);
    expect(matches).toHaveLength(1);
    expect(matches[0].confidence).toBe(0.7);
    expect(matches[0].autoConfirm).toBe(false);
  });

  it("does not link when date offset exceeds 2 days", () => {
    const candidates = [
      makeCandidate({
        id: "t1",
        accountId: "acc-a",
        amount: "-1000.00",
        date: "2025-05-01",
      }),
      makeCandidate({
        id: "t2",
        accountId: "acc-b",
        amount: "1000.00",
        date: "2025-05-04",
      }),
    ];

    const matches = findTransferMatches(candidates);
    expect(matches).toHaveLength(0);
  });

  it("does not link same account", () => {
    const candidates = [
      makeCandidate({
        id: "t1",
        accountId: "acc-a",
        amount: "-1000.00",
      }),
      makeCandidate({
        id: "t2",
        accountId: "acc-a",
        amount: "1000.00",
      }),
    ];

    const matches = findTransferMatches(candidates);
    expect(matches).toHaveLength(0);
  });

  it("does not link same sign amounts", () => {
    const candidates = [
      makeCandidate({
        id: "t1",
        accountId: "acc-a",
        amount: "-5000.00",
      }),
      makeCandidate({
        id: "t2",
        accountId: "acc-b",
        amount: "-5000.00",
      }),
    ];

    const matches = findTransferMatches(candidates);
    expect(matches).toHaveLength(0);
  });

  it("does not link different currencies", () => {
    const candidates = [
      makeCandidate({
        id: "t1",
        accountId: "acc-a",
        amount: "-1000.00",
        currency: "NOK",
      }),
      makeCandidate({
        id: "t2",
        accountId: "acc-b",
        amount: "1000.00",
        currency: "EUR",
      }),
    ];

    const matches = findTransferMatches(candidates);
    expect(matches).toHaveLength(0);
  });

  it("does not link incompatible transaction types", () => {
    const candidates = [
      makeCandidate({
        id: "t1",
        accountId: "acc-a",
        amount: "-5000.00",
        transactionType: "internal_transfer",
      }),
      makeCandidate({
        id: "t2",
        accountId: "acc-b",
        amount: "5000.00",
        transactionType: "investment",
      }),
    ];

    const matches = findTransferMatches(candidates);
    expect(matches).toHaveLength(0);
  });

  it("links investment types across accounts", () => {
    const candidates = [
      makeCandidate({
        id: "t1",
        accountId: "acc-checking",
        amount: "-10000.00",
        transactionType: "investment",
      }),
      makeCandidate({
        id: "t2",
        accountId: "acc-fund",
        amount: "10000.00",
        transactionType: "investment",
      }),
    ];

    const matches = findTransferMatches(candidates);
    expect(matches).toHaveLength(1);
    expect(matches[0].confidence).toBe(0.95);
  });

  it("skips already-linked transactions", () => {
    const candidates = [
      makeCandidate({
        id: "t1",
        accountId: "acc-a",
        amount: "-5000.00",
        transferGroupId: "existing-group",
      }),
      makeCandidate({
        id: "t2",
        accountId: "acc-b",
        amount: "5000.00",
      }),
    ];

    const matches = findTransferMatches(candidates);
    expect(matches).toHaveLength(0);
  });

  it("handles multiple transfer pairs in one batch", () => {
    const candidates = [
      makeCandidate({
        id: "t1",
        accountId: "acc-a",
        amount: "-5000.00",
        date: "2025-05-01",
      }),
      makeCandidate({
        id: "t2",
        accountId: "acc-b",
        amount: "5000.00",
        date: "2025-05-01",
      }),
      makeCandidate({
        id: "t3",
        accountId: "acc-a",
        amount: "-2000.00",
        date: "2025-05-05",
      }),
      makeCandidate({
        id: "t4",
        accountId: "acc-b",
        amount: "2000.00",
        date: "2025-05-05",
      }),
    ];

    const matches = findTransferMatches(candidates);
    expect(matches).toHaveLength(2);
  });

  it("picks the best match when multiple candidates exist", () => {
    const candidates = [
      makeCandidate({
        id: "t1",
        accountId: "acc-a",
        amount: "-5000.00",
        date: "2025-05-01",
      }),
      // Same date — higher confidence
      makeCandidate({
        id: "t2",
        accountId: "acc-b",
        amount: "5000.00",
        date: "2025-05-01",
      }),
      // 1 day offset — lower confidence
      makeCandidate({
        id: "t3",
        accountId: "acc-c",
        amount: "5000.00",
        date: "2025-05-02",
      }),
    ];

    const matches = findTransferMatches(candidates);
    expect(matches).toHaveLength(1);
    expect(matches[0].sourceId).toBe("t1");
    expect(matches[0].destinationId).toBe("t2");
    expect(matches[0].confidence).toBe(0.95);
  });

  it("does not link p2p_payment types", () => {
    const candidates = [
      makeCandidate({
        id: "t1",
        accountId: "acc-a",
        amount: "-500.00",
        transactionType: "p2p_payment",
      }),
      makeCandidate({
        id: "t2",
        accountId: "acc-b",
        amount: "500.00",
        transactionType: "p2p_payment",
      }),
    ];

    const matches = findTransferMatches(candidates);
    expect(matches).toHaveLength(0);
  });

  it("does not link bank_transfer types", () => {
    const candidates = [
      makeCandidate({
        id: "t1",
        accountId: "acc-a",
        amount: "-500.00",
        transactionType: "bank_transfer",
      }),
      makeCandidate({
        id: "t2",
        accountId: "acc-b",
        amount: "500.00",
        transactionType: "bank_transfer",
      }),
    ];

    const matches = findTransferMatches(candidates);
    expect(matches).toHaveLength(0);
  });

  it("does not link loan_payment types", () => {
    const candidates = [
      makeCandidate({
        id: "t1",
        accountId: "acc-a",
        amount: "-5000.00",
        transactionType: "loan_payment",
      }),
      makeCandidate({
        id: "t2",
        accountId: "acc-b",
        amount: "5000.00",
        transactionType: "loan_payment",
      }),
    ];

    const matches = findTransferMatches(candidates);
    expect(matches).toHaveLength(0);
  });

  it("handles near amount (within 1%) with same date at confidence 0.60", () => {
    const candidates = [
      makeCandidate({
        id: "t1",
        accountId: "acc-a",
        amount: "-5000.00",
        date: "2025-05-01",
      }),
      makeCandidate({
        id: "t2",
        accountId: "acc-b",
        amount: "5005.00",
        date: "2025-05-01",
      }),
    ];

    // 5005 vs 5000 = 0.1% difference, within 1%
    const matches = findTransferMatches(candidates);
    expect(matches).toHaveLength(1);
    expect(matches[0].confidence).toBe(0.6);
    expect(matches[0].autoConfirm).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// findOneSidedTransfers
// ---------------------------------------------------------------------------

describe("findOneSidedTransfers", () => {
  it("returns unmatched internal_transfer IDs", () => {
    const candidates = [
      makeCandidate({
        id: "t1",
        transactionType: "internal_transfer",
      }),
    ];

    const oneSided = findOneSidedTransfers(candidates, new Set());
    expect(oneSided).toEqual(["t1"]);
  });

  it("returns unmatched investment IDs", () => {
    const candidates = [
      makeCandidate({ id: "t1", transactionType: "investment" }),
    ];

    const oneSided = findOneSidedTransfers(candidates, new Set());
    expect(oneSided).toEqual(["t1"]);
  });

  it("excludes already-matched transactions", () => {
    const candidates = [
      makeCandidate({
        id: "t1",
        transactionType: "internal_transfer",
      }),
    ];

    const oneSided = findOneSidedTransfers(candidates, new Set(["t1"]));
    expect(oneSided).toEqual([]);
  });

  it("excludes p2p_payment and bank_transfer", () => {
    const candidates = [
      makeCandidate({ id: "t1", transactionType: "p2p_payment" }),
      makeCandidate({ id: "t2", transactionType: "bank_transfer" }),
    ];

    const oneSided = findOneSidedTransfers(candidates, new Set());
    expect(oneSided).toEqual([]);
  });

  it("excludes already-linked transactions", () => {
    const candidates = [
      makeCandidate({
        id: "t1",
        transactionType: "internal_transfer",
        transferGroupId: "existing",
      }),
    ];

    const oneSided = findOneSidedTransfers(candidates, new Set());
    expect(oneSided).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// isTransferCandidate
// ---------------------------------------------------------------------------

describe("isTransferCandidate", () => {
  it("returns true for internal_transfer", () => {
    expect(isTransferCandidate("internal_transfer")).toBe(true);
  });

  it("returns true for investment", () => {
    expect(isTransferCandidate("investment")).toBe(true);
  });

  it("returns false for p2p_payment", () => {
    expect(isTransferCandidate("p2p_payment")).toBe(false);
  });

  it("returns false for bank_transfer", () => {
    expect(isTransferCandidate("bank_transfer")).toBe(false);
  });

  it("returns false for loan_payment", () => {
    expect(isTransferCandidate("loan_payment")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isTransferCandidate(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AUTO_EXCLUDE_TYPES
// ---------------------------------------------------------------------------

describe("AUTO_EXCLUDE_TYPES", () => {
  it("includes internal_transfer and investment", () => {
    expect(AUTO_EXCLUDE_TYPES.has("internal_transfer")).toBe(true);
    expect(AUTO_EXCLUDE_TYPES.has("investment")).toBe(true);
  });

  it("does not include p2p_payment or bank_transfer", () => {
    expect(AUTO_EXCLUDE_TYPES.has("p2p_payment")).toBe(false);
    expect(AUTO_EXCLUDE_TYPES.has("bank_transfer")).toBe(false);
  });
});
