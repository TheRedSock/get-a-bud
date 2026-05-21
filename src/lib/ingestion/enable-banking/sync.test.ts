import { AppError } from "@/lib/errors/app-error";

/**
 * Focused tests for sync orchestration entry-point validation, error handling,
 * and behavioral regression coverage.
 *
 * Behavioral tests cover:
 * - Pagination through empty pages with continuation_key
 * - Checkpoint resume from sync_runs.metadata
 * - Rate-limit pause and retry behavior
 * - User-edit preservation during re-imports
 * - Reconciliation offsets when balance differs from history
 */

// --- Mock DB layer ---
const mockDbSelect = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbInsert = vi.fn();
const mockDbDelete = vi.fn();

// --- Mock EB client methods ---
const mockGetSession = vi.fn();
const mockGetAccountDetails = vi.fn();
const mockGetAccountBalances = vi.fn();
const mockGetTransactions = vi.fn();
const mockMapAccount = vi.fn();
const mockMapTransaction = vi.fn();

// --- Rate-limit error class shared between mock and tests ---
class MockRateLimitError extends Error {
  retryAt?: Date;
  constructor(retryAt?: Date) {
    super("Enable Banking rate limit exceeded");
    this.name = "EnableBankingRateLimitError";
    this.retryAt = retryAt;
  }
}

// Class-based mock so `new EnableBankingClient(...)` works after vi.clearAllMocks()
class MockEnableBankingClient {
  getSession = mockGetSession;
  getAccountDetails = mockGetAccountDetails;
  getAccountBalances = mockGetAccountBalances;
  getTransactions = mockGetTransactions;
}

// --- Chain helpers for simple validation tests (existing) ---

function mockChainSelect(results: unknown[] = []) {
  return mockDbSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(results),
      }),
    }),
  });
}

// --- Chain helpers for behavioral tests ---

/** Build a select chain where .where() is thenable and optionally chainable to .limit(). */
function selectChain(result: unknown[]) {
  const p = Promise.resolve(result);
  const afterWhere = { limit: vi.fn(() => p), then: p.then.bind(p), catch: p.catch.bind(p) };
  const afterFrom = { where: vi.fn(() => afterWhere), limit: vi.fn(() => p), then: p.then.bind(p), catch: p.catch.bind(p) };
  return { from: vi.fn(() => afterFrom) };
}

/** Build an insert chain supporting .values(), .onConflictDoUpdate(), .returning(). */
function insertChain(result: unknown[]) {
  const p = Promise.resolve(result);
  const returnable = { returning: vi.fn(() => p), then: p.then.bind(p), catch: p.catch.bind(p) };
  return {
    values: vi.fn(() => ({
      onConflictDoUpdate: vi.fn(() => returnable),
      returning: vi.fn(() => p),
      then: p.then.bind(p),
      catch: p.catch.bind(p),
    })),
  };
}

/** Build an update chain: .set().where() → void. Captures set values if a collector is provided. */
function updateChain(collector?: Array<{ setValues: unknown }>) {
  const p = Promise.resolve(undefined);
  return {
    set: vi.fn((setValues: unknown) => {
      if (collector) collector.push({ setValues });
      return { where: vi.fn(() => p), then: p.then.bind(p), catch: p.catch.bind(p) };
    }),
  };
}

function deleteChain() {
  return { where: vi.fn(() => Promise.resolve(undefined)) };
}

// --- Module mocks ---

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
    update: (...args: unknown[]) => mockDbUpdate(...args),
    insert: (...args: unknown[]) => mockDbInsert(...args),
    delete: (...args: unknown[]) => mockDbDelete(...args),
  },
}));

vi.mock("@/lib/finance/categorization", () => ({
  normalizeMerchant: vi.fn().mockReturnValue("test"),
}));

vi.mock("@/lib/ingestion/enable-banking/client", () => ({
  EnableBankingClient: MockEnableBankingClient,
  EnableBankingRateLimitError: MockRateLimitError,
  mapEnableBankingAccount: (...args: unknown[]) => mockMapAccount(...args),
  mapEnableBankingTransaction: (...args: unknown[]) => mockMapTransaction(...args),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), exception: vi.fn() },
}));

vi.mock("@/lib/security/encryption", () => ({
  decryptSecret: vi.fn().mockReturnValue("mock-pem"),
}));

// --- Shared fixtures ---

function validConnection(overrides: Record<string, unknown> = {}) {
  return {
    id: "conn-1",
    householdId: "hh-1",
    provider: "enable_banking",
    consentSessionId: "session-1",
    externalApplicationId: "app-1",
    metadata: {},
    lastSyncedAt: null,
    status: "connected",
    rateLimitedUntil: null,
    encryptedPrivateKey: "enc",
    encryptedPrivateKeyIv: "iv",
    encryptedPrivateKeyTag: "tag",
    ...overrides,
  };
}

function normalizedAccount(overrides: Record<string, unknown> = {}) {
  return {
    providerAccountId: "acct-1",
    name: "Test Account",
    currency: "NOK",
    balance: "100.00",
    kind: "checking",
    institutionName: "Test Bank",
    raw: {},
    ...overrides,
  };
}

function normalizedTransaction(overrides: Record<string, unknown> = {}) {
  return {
    providerTransactionId: "tx-1",
    providerAccountId: "acct-1",
    amount: "100.00",
    currency: "NOK",
    date: "2026-01-15",
    merchantName: "Provider Merchant",
    description: "Provider description",
    raw: { transaction_id: "raw-tx-1" },
    ...overrides,
  };
}

function providerAccountRow(overrides: Record<string, unknown> = {}) {
  return { id: "pa-1", financialAccountId: null, ...overrides };
}

function financialAccountRow(overrides: Record<string, unknown> = {}) {
  return { id: "fa-1", ...overrides };
}

function transactionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "txdb-1",
    sourceTransactionId: "tx-1",
    accountId: "fa-1",
    amountCents: 10000,
    currency: "NOK",
    date: "2026-01-15",
    merchantName: "Provider Merchant",
    description: "Provider description",
    metadata: {},
    ...overrides,
  };
}

/**
 * Set up mocks for a full sync flow with one account and one page of
 * transactions. Each test can override specific parts.
 */
function setupFullSyncMocks(options: {
  connection?: Record<string, unknown>;
  runMetadata?: Record<string, unknown>;
  providerAccount?: Record<string, unknown>;
  financialAccount?: Record<string, unknown>;
  existingTransactions?: unknown[];
  insertedTransactions?: unknown[];
  reconTotals?: Record<string, unknown>;
  reconOffset?: unknown[];
  reconEarliest?: Record<string, unknown>;
  reconAccountMeta?: Record<string, unknown>;
  session?: Record<string, unknown>;
  balances?: Record<string, unknown>;
} = {}) {
  const conn = validConnection(options.connection);
  const meta = options.runMetadata ?? {};
  const pa = providerAccountRow(options.providerAccount);
  const fa = financialAccountRow(options.financialAccount);
  const existingTxs = options.existingTransactions ?? [];
  const insertedTxs = options.insertedTransactions ?? [transactionRow()];
  const totals = options.reconTotals ?? { totalSumCents: 10000, nonOffsetSumCents: 10000, manualCount: 0 };
  const offset = options.reconOffset ?? [];
  const earliest = options.reconEarliest ?? { date: "2026-01-15" };
  const accountMeta = options.reconAccountMeta ?? { metadata: {} };

  // Select sequence: connection, run metadata, [batch lookup per page], recon totals,
  // recon offset, recon earliest, recon account metadata
  mockDbSelect
    .mockReturnValueOnce(selectChain([conn]))
    .mockReturnValueOnce(selectChain([{ metadata: meta }]))
    .mockReturnValueOnce(selectChain(existingTxs))
    .mockReturnValueOnce(selectChain([totals]))
    .mockReturnValueOnce(selectChain(offset))
    .mockReturnValueOnce(selectChain([earliest]))
    .mockReturnValueOnce(selectChain([accountMeta]));

  // Insert sequence: provider account, financial account, transactions
  mockDbInsert
    .mockReturnValueOnce(insertChain([pa]))
    .mockReturnValueOnce(insertChain([fa]))
    .mockReturnValueOnce(insertChain(insertedTxs));

  // Updates always succeed
  mockDbUpdate.mockImplementation(() => updateChain());
  mockDbDelete.mockImplementation(() => deleteChain());

  // Client defaults
  mockGetSession.mockResolvedValue(
    options.session ?? { accounts: ["acct-1"], aspsp: { name: "Test Bank" } },
  );
  mockGetAccountDetails.mockResolvedValue({ uid: "acct-1", name: "Test Account", currency: "NOK" });
  mockGetAccountBalances.mockResolvedValue(
    options.balances ?? { balances: [{ balance_amount: { amount: "100.00" } }] },
  );
  mockGetTransactions.mockResolvedValue({ transactions: [{ transaction_id: "raw-tx-1" }] });

  // Mapping defaults
  mockMapAccount.mockReturnValue(normalizedAccount());
  mockMapTransaction.mockReturnValue(normalizedTransaction());

  return { conn, meta };
}

// ─── Validation tests (existing) ────────────────────────────────────────────

describe("syncEnableBankingConnection", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("throws a notFoundError when connection does not exist", async () => {
    mockChainSelect([]);

    const { syncEnableBankingConnection } = await import(
      "@/lib/ingestion/enable-banking/sync"
    );

    await expect(
      syncEnableBankingConnection("missing-id", {}),
    ).rejects.toMatchObject({
      code: "not_found",
      status: 404,
    });
  });

  it("throws a configurationError when consent session id is missing", async () => {
    mockChainSelect([
      {
        id: "conn-1",
        provider: "enable_banking",
        consentSessionId: null,
        externalApplicationId: "app-1",
        metadata: {},
        lastSyncedAt: null,
        encryptedPrivateKey: "enc",
        encryptedPrivateKeyIv: "iv",
        encryptedPrivateKeyTag: "tag",
      },
    ]);

    const { syncEnableBankingConnection } = await import(
      "@/lib/ingestion/enable-banking/sync"
    );

    await expect(
      syncEnableBankingConnection("conn-1", {}),
    ).rejects.toMatchObject({
      code: "configuration_error",
      status: 500,
    });
  });

  it("throws a configurationError when application id is missing", async () => {
    mockChainSelect([
      {
        id: "conn-1",
        provider: "enable_banking",
        consentSessionId: "session-1",
        externalApplicationId: null,
        metadata: {},
        lastSyncedAt: null,
        encryptedPrivateKey: "enc",
        encryptedPrivateKeyIv: "iv",
        encryptedPrivateKeyTag: "tag",
      },
    ]);

    const { syncEnableBankingConnection } = await import(
      "@/lib/ingestion/enable-banking/sync"
    );

    await expect(
      syncEnableBankingConnection("conn-1", {}),
    ).rejects.toMatchObject({
      code: "configuration_error",
      status: 500,
    });
  });

  it("uses AppError types, not plain Error, for all validation throws", async () => {
    mockChainSelect([]);

    const { syncEnableBankingConnection } = await import(
      "@/lib/ingestion/enable-banking/sync"
    );

    try {
      await syncEnableBankingConnection("missing", {});
      expect.unreachable("should have thrown");
    } catch (error) {
      // Verify it's an AppError, not a plain Error
      expect(error).toBeInstanceOf(AppError);
    }
  });
});

// ─── Behavioral regression tests ────────────────────────────────────────────

describe("sync pagination behavior", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("follows continuation_key through empty pages until the key is absent", async () => {
    const conn = validConnection();

    // Selects: connection, metadata, batch-lookup-page2, recon×4
    mockDbSelect
      .mockReturnValueOnce(selectChain([conn]))
      .mockReturnValueOnce(selectChain([{ metadata: {} }]))
      // No batch lookup for page 1 (empty transactions)
      // Batch lookup for page 2 (has transactions — no existing)
      .mockReturnValueOnce(selectChain([]))
      // No batch lookup for page 3 (empty transactions)
      // Reconciliation
      .mockReturnValueOnce(selectChain([{ totalSumCents: 10000, nonOffsetSumCents: 10000, manualCount: 0 }]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([{ date: "2026-01-15" }]))
      .mockReturnValueOnce(selectChain([{ metadata: {} }]));

    mockDbInsert
      .mockReturnValueOnce(insertChain([providerAccountRow()]))
      .mockReturnValueOnce(insertChain([financialAccountRow()]))
      .mockReturnValueOnce(insertChain([transactionRow()]));

    mockDbUpdate.mockImplementation(() => updateChain());
    mockDbDelete.mockImplementation(() => deleteChain());

    mockGetSession.mockResolvedValue({ accounts: ["acct-1"], aspsp: { name: "Test Bank" } });
    mockGetAccountDetails.mockResolvedValue({ uid: "acct-1", name: "Test", currency: "NOK" });
    mockGetAccountBalances.mockResolvedValue({ balances: [{ balance_amount: { amount: "100.00" } }] });

    // Page 1: empty but has continuation_key
    // Page 2: has transactions and continuation_key
    // Page 3: empty and NO continuation_key → done
    mockGetTransactions
      .mockResolvedValueOnce({ transactions: [], continuation_key: "page2" })
      .mockResolvedValueOnce({ transactions: [{ transaction_id: "raw-tx-1" }], continuation_key: "page3" })
      .mockResolvedValueOnce({ transactions: [] });

    mockMapAccount.mockReturnValue(normalizedAccount());
    mockMapTransaction.mockReturnValue(normalizedTransaction());

    const { syncEnableBankingConnection } = await import(
      "@/lib/ingestion/enable-banking/sync"
    );
    const result = await syncEnableBankingConnection("conn-1", {
      syncRunId: "run-1",
      maxPages: 100,
      maxDurationMs: 300_000,
    });

    // All three pages were fetched, including the empty ones
    expect(mockGetTransactions).toHaveBeenCalledTimes(3);
    expect(result.transactions).toHaveLength(1);
    expect(result.progress?.pagesFetched).toBe(3);
    expect(result.continuationRequired).toBeUndefined();
  });
});

describe("sync checkpoint resume", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("resumes from saved cursor when paramsKey matches current parameters", async () => {
    // The paramsKey for initial sync: {"dateFrom":null,"dateTo":null,"strategy":"longest","transactionStatus":"BOOK"}
    const matchingParamsKey = JSON.stringify({
      dateFrom: null,
      dateTo: null,
      strategy: "longest",
      transactionStatus: "BOOK",
    });

    const runMetadata = {
      enableBanking: {
        transactionParams: { strategy: "longest", transactionStatus: "BOOK" },
        accountCursors: {
          "acct-1": {
            continuationKey: "saved-cursor-abc",
            paramsKey: matchingParamsKey,
          },
        },
      },
    };

    const conn = validConnection();

    mockDbSelect
      .mockReturnValueOnce(selectChain([conn]))
      .mockReturnValueOnce(selectChain([{ metadata: runMetadata }]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([{ totalSumCents: 10000, nonOffsetSumCents: 10000, manualCount: 0 }]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([{ date: "2026-01-15" }]))
      .mockReturnValueOnce(selectChain([{ metadata: {} }]));

    mockDbInsert
      .mockReturnValueOnce(insertChain([providerAccountRow()]))
      .mockReturnValueOnce(insertChain([financialAccountRow()]))
      .mockReturnValueOnce(insertChain([transactionRow()]));

    mockDbUpdate.mockImplementation(() => updateChain());
    mockDbDelete.mockImplementation(() => deleteChain());

    mockGetSession.mockResolvedValue({ accounts: ["acct-1"], aspsp: { name: "Test Bank" } });
    mockGetAccountDetails.mockResolvedValue({ uid: "acct-1", name: "Test", currency: "NOK" });
    mockGetAccountBalances.mockResolvedValue({ balances: [{ balance_amount: { amount: "100.00" } }] });
    mockGetTransactions.mockResolvedValue({ transactions: [{ transaction_id: "raw-tx-1" }] });

    mockMapAccount.mockReturnValue(normalizedAccount());
    mockMapTransaction.mockReturnValue(normalizedTransaction());

    const { syncEnableBankingConnection } = await import(
      "@/lib/ingestion/enable-banking/sync"
    );
    await syncEnableBankingConnection("conn-1", {
      syncRunId: "run-1",
      maxPages: 100,
      maxDurationMs: 300_000,
    });

    // The first getTransactions call should use the saved continuation key
    expect(mockGetTransactions).toHaveBeenCalledWith(
      expect.objectContaining({ continuationKey: "saved-cursor-abc" }),
    );
  });

  it("ignores saved cursor when paramsKey does not match", async () => {
    const runMetadata = {
      enableBanking: {
        transactionParams: { strategy: "longest", transactionStatus: "BOOK" },
        accountCursors: {
          "acct-1": {
            continuationKey: "stale-cursor",
            paramsKey: "wrong-params-key",
          },
        },
      },
    };

    const conn = validConnection();

    mockDbSelect
      .mockReturnValueOnce(selectChain([conn]))
      .mockReturnValueOnce(selectChain([{ metadata: runMetadata }]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([{ totalSumCents: 10000, nonOffsetSumCents: 10000, manualCount: 0 }]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([{ date: "2026-01-15" }]))
      .mockReturnValueOnce(selectChain([{ metadata: {} }]));

    mockDbInsert
      .mockReturnValueOnce(insertChain([providerAccountRow()]))
      .mockReturnValueOnce(insertChain([financialAccountRow()]))
      .mockReturnValueOnce(insertChain([transactionRow()]));

    mockDbUpdate.mockImplementation(() => updateChain());
    mockDbDelete.mockImplementation(() => deleteChain());

    mockGetSession.mockResolvedValue({ accounts: ["acct-1"], aspsp: { name: "Test Bank" } });
    mockGetAccountDetails.mockResolvedValue({ uid: "acct-1", name: "Test", currency: "NOK" });
    mockGetAccountBalances.mockResolvedValue({ balances: [{ balance_amount: { amount: "100.00" } }] });
    mockGetTransactions.mockResolvedValue({ transactions: [{ transaction_id: "raw-tx-1" }] });

    mockMapAccount.mockReturnValue(normalizedAccount());
    mockMapTransaction.mockReturnValue(normalizedTransaction());

    const { syncEnableBankingConnection } = await import(
      "@/lib/ingestion/enable-banking/sync"
    );
    await syncEnableBankingConnection("conn-1", {
      syncRunId: "run-1",
      maxPages: 100,
      maxDurationMs: 300_000,
    });

    // Stale cursor is not used — continuationKey should be undefined
    expect(mockGetTransactions).toHaveBeenCalledWith(
      expect.objectContaining({ continuationKey: undefined }),
    );
  });
});

describe("sync rate-limit handling", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("records progress and returns rateLimitedUntil on EnableBankingRateLimitError", async () => {
    const retryDate = new Date("2026-06-01T12:00:00Z");
    const conn = validConnection();

    // Only 2 selects needed: connection + metadata (error happens at getSession)
    mockDbSelect
      .mockReturnValueOnce(selectChain([conn]))
      .mockReturnValueOnce(selectChain([{ metadata: {} }]));

    mockDbUpdate.mockImplementation(() => updateChain());

    // getSession throws rate-limit error before any account processing
    mockGetSession.mockRejectedValue(new MockRateLimitError(retryDate));

    const { syncEnableBankingConnection } = await import(
      "@/lib/ingestion/enable-banking/sync"
    );
    const result = await syncEnableBankingConnection("conn-1", { syncRunId: "run-1" });

    expect(result.rateLimitedUntil).toEqual(retryDate);
    expect(result.accounts).toHaveLength(0);
    expect(result.transactions).toHaveLength(0);
    // rateLimitedUntil is also recorded in the internal progress metadata
    expect((result.progress as Record<string, unknown>)?.rateLimitedUntil).toBe(
      retryDate.toISOString(),
    );
  });

  it("uses a 6-hour fallback when retryAt is not provided", async () => {
    const conn = validConnection();

    mockDbSelect
      .mockReturnValueOnce(selectChain([conn]))
      .mockReturnValueOnce(selectChain([{ metadata: {} }]));

    mockDbUpdate.mockImplementation(() => updateChain());
    mockGetSession.mockRejectedValue(new MockRateLimitError());

    const before = Date.now();

    const { syncEnableBankingConnection } = await import(
      "@/lib/ingestion/enable-banking/sync"
    );
    const result = await syncEnableBankingConnection("conn-1", { syncRunId: "run-1" });

    const sixHoursMs = 6 * 60 * 60 * 1000;

    expect(result.rateLimitedUntil).toBeDefined();
    expect(result.rateLimitedUntil!.getTime()).toBeGreaterThanOrEqual(before + sixHoursMs - 1000);
    expect(result.rateLimitedUntil!.getTime()).toBeLessThanOrEqual(Date.now() + sixHoursMs + 1000);
  });
});

describe("sync user-edit preservation", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("preserves user-edited description when re-importing a synced transaction", async () => {
    const conn = validConnection();

    // Existing transaction with user-edited description
    const existingTx = {
      id: "existing-tx-1",
      sourceTransactionId: "tx-1",
      description: "User custom description",
      merchantName: "Original merchant",
      metadata: {
        userEdits: {
          descriptionEdited: true,
          merchantNameEdited: false,
          originalDescription: "Provider original",
        },
      },
    };

    // Provider account already linked to financial account
    const pa = providerAccountRow({ financialAccountId: "fa-1" });

    mockDbSelect
      .mockReturnValueOnce(selectChain([conn]))
      .mockReturnValueOnce(selectChain([{ metadata: {} }]))
      // Batch lookup returns the existing transaction
      .mockReturnValueOnce(selectChain([existingTx]))
      // Reconciliation
      .mockReturnValueOnce(selectChain([{ totalSumCents: 10000, nonOffsetSumCents: 10000, manualCount: 0 }]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([{ date: "2026-01-15" }]))
      .mockReturnValueOnce(selectChain([{ metadata: {} }]));

    // Provider account already linked — no financial account insert
    mockDbInsert
      .mockReturnValueOnce(insertChain([pa]));

    // Track update calls to inspect the transaction update
    const capturedSets: unknown[] = [];
    mockDbUpdate.mockImplementation(() => {
      const p = Promise.resolve(undefined);
      return {
        set: vi.fn((setValues: unknown) => {
          capturedSets.push(setValues);
          return { where: vi.fn(() => p), then: p.then.bind(p), catch: p.catch.bind(p) };
        }),
      };
    });
    mockDbDelete.mockImplementation(() => deleteChain());

    mockGetSession.mockResolvedValue({ accounts: ["acct-1"], aspsp: { name: "Test Bank" } });
    mockGetAccountDetails.mockResolvedValue({ uid: "acct-1", name: "Test", currency: "NOK" });
    mockGetAccountBalances.mockResolvedValue({ balances: [{ balance_amount: { amount: "100.00" } }] });
    mockGetTransactions.mockResolvedValue({ transactions: [{ transaction_id: "raw-tx-1" }] });

    mockMapAccount.mockReturnValue(normalizedAccount());
    mockMapTransaction.mockReturnValue(normalizedTransaction({
      description: "New provider description",
      merchantName: "New provider merchant",
    }));

    const { syncEnableBankingConnection } = await import(
      "@/lib/ingestion/enable-banking/sync"
    );
    await syncEnableBankingConnection("conn-1", {
      syncRunId: "run-1",
      maxPages: 100,
      maxDurationMs: 300_000,
    });

    // Find the update that contains the description field (the transaction update)
    const txUpdate = capturedSets.find(
      (s) => typeof s === "object" && s !== null && "description" in s,
    ) as Record<string, unknown> | undefined;

    expect(txUpdate).toBeDefined();
    // User-edited description is preserved, not overwritten by provider
    expect(txUpdate!.description).toBe("User custom description");
    // Merchant was NOT user-edited, so it takes the new provider value
    expect(txUpdate!.merchantName).toBe("New provider merchant");
    // userEdits metadata is preserved in the merged metadata
    expect(txUpdate!.metadata).toMatchObject({
      userEdits: expect.objectContaining({ descriptionEdited: true }),
    });
  });

  it("does not overwrite provider-owned amount, currency, or date on re-import", async () => {
    const conn = validConnection();

    const existingTx = {
      id: "existing-tx-2",
      sourceTransactionId: "tx-2",
      description: "Grocery store",
      merchantName: "Store",
      amountCents: -5000,
      currency: "NOK",
      date: "2026-01-10",
      metadata: {},
    };

    const pa = providerAccountRow({ financialAccountId: "fa-1" });

    mockDbSelect
      .mockReturnValueOnce(selectChain([conn]))
      .mockReturnValueOnce(selectChain([{ metadata: {} }]))
      .mockReturnValueOnce(selectChain([existingTx]))
      .mockReturnValueOnce(selectChain([{ totalSumCents: -5000, nonOffsetSumCents: -5000, manualCount: 0 }]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([{ date: "2026-01-10" }]))
      .mockReturnValueOnce(selectChain([{ metadata: {} }]));

    mockDbInsert
      .mockReturnValueOnce(insertChain([pa]))
      .mockReturnValueOnce(insertChain([{ id: "offset-tx" }]));

    const capturedSets: unknown[] = [];
    mockDbUpdate.mockImplementation(() => {
      const p = Promise.resolve(undefined);
      return {
        set: vi.fn((setValues: unknown) => {
          capturedSets.push(setValues);
          return { where: vi.fn(() => p), then: p.then.bind(p), catch: p.catch.bind(p) };
        }),
      };
    });
    mockDbDelete.mockImplementation(() => deleteChain());

    mockGetSession.mockResolvedValue({ accounts: ["acct-1"], aspsp: { name: "Test Bank" } });
    mockGetAccountDetails.mockResolvedValue({ uid: "acct-1", name: "Test", currency: "NOK" });
    mockGetAccountBalances.mockResolvedValue({ balances: [{ balance_amount: { amount: "100.00" } }] });
    mockGetTransactions.mockResolvedValue({ transactions: [{ transaction_id: "raw-tx-2" }] });

    mockMapAccount.mockReturnValue(normalizedAccount());
    mockMapTransaction.mockReturnValue(
      normalizedTransaction({
        providerTransactionId: "tx-2",
        amountCents: -9999,
        currency: "EUR",
        date: "2026-02-01",
        description: "Changed provider description",
      }),
    );

    const { syncEnableBankingConnection } = await import(
      "@/lib/ingestion/enable-banking/sync"
    );
    await syncEnableBankingConnection("conn-1", {
      syncRunId: "run-1",
      maxPages: 100,
      maxDurationMs: 300_000,
    });

    const txUpdate = capturedSets.find(
      (s) => typeof s === "object" && s !== null && "description" in s,
    ) as Record<string, unknown> | undefined;

    expect(txUpdate).toBeDefined();
    expect(txUpdate).not.toHaveProperty("amountCents");
    expect(txUpdate).not.toHaveProperty("currency");
    expect(txUpdate).not.toHaveProperty("date");
    expect(txUpdate).not.toHaveProperty("accountId");
    expect(txUpdate!.description).toBe("Changed provider description");
  });
});

describe("sync balance reconciliation", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("creates an offset transaction when reported balance exceeds transaction sum", async () => {
    const conn = validConnection();

    // Single empty page (no transactions to import)
    mockDbSelect
      .mockReturnValueOnce(selectChain([conn]))
      .mockReturnValueOnce(selectChain([{ metadata: {} }]))
      // No batch lookup (empty page)
      // Reconciliation: sum is 0 but reported balance is 500.00
      .mockReturnValueOnce(selectChain([{ totalSumCents: 0, nonOffsetSumCents: 0, manualCount: 0 }]))
      .mockReturnValueOnce(selectChain([]))        // no existing offset
      .mockReturnValueOnce(selectChain([{ date: null }])) // no earliest date
      .mockReturnValueOnce(selectChain([{ metadata: {} }]));

    // Track inserts to verify offset creation
    const insertCalls: Array<{ values: unknown }> = [];
    let insertCallCount = 0;
    mockDbInsert.mockImplementation(() => {
      insertCallCount++;
      const p = Promise.resolve([{ id: `inserted-${insertCallCount}` }]);
      return {
        values: vi.fn((vals: unknown) => {
          insertCalls.push({ values: vals });
          return {
            onConflictDoUpdate: vi.fn(() => ({
              returning: vi.fn(() => p),
              then: p.then.bind(p),
              catch: p.catch.bind(p),
            })),
            returning: vi.fn(() => p),
            then: p.then.bind(p),
            catch: p.catch.bind(p),
          };
        }),
      };
    });

    // Track updates to verify balance is set
    const capturedSets: unknown[] = [];
    mockDbUpdate.mockImplementation(() => {
      const p = Promise.resolve(undefined);
      return {
        set: vi.fn((setValues: unknown) => {
          capturedSets.push(setValues);
          return { where: vi.fn(() => p), then: p.then.bind(p), catch: p.catch.bind(p) };
        }),
      };
    });
    mockDbDelete.mockImplementation(() => deleteChain());

    mockGetSession.mockResolvedValue({ accounts: ["acct-1"], aspsp: { name: "Test Bank" } });
    mockGetAccountDetails.mockResolvedValue({ uid: "acct-1", name: "Test", currency: "NOK" });
    mockGetAccountBalances.mockResolvedValue({ balances: [{ balance_amount: { amount: "500.00" } }] });
    mockGetTransactions.mockResolvedValue({ transactions: [] }); // empty page

    mockMapAccount.mockReturnValue(normalizedAccount({ balance: "500.00" }));

    const { syncEnableBankingConnection } = await import(
      "@/lib/ingestion/enable-banking/sync"
    );
    await syncEnableBankingConnection("conn-1", {
      syncRunId: "run-1",
      maxPages: 100,
      maxDurationMs: 300_000,
    });

    // An offset transaction should have been inserted
    // The offset insert is the one with the opening balance adjustment values
    const offsetInsert = insertCalls.find((c) => {
      const v = c.values as Record<string, unknown>;
      return typeof v?.description === "string" && v.description.includes("Opening balance");
    });
    expect(offsetInsert).toBeDefined();
    expect((offsetInsert!.values as Record<string, unknown>).amountCents).toBe(50000);
    expect((offsetInsert!.values as Record<string, unknown>).currency).toBe("NOK");

    // Financial account balance should be set to the reported balance
    const balanceUpdate = capturedSets.find(
      (s) => typeof s === "object" && s !== null && "currentBalanceCents" in s,
    ) as Record<string, unknown> | undefined;
    expect(balanceUpdate).toBeDefined();
    expect(balanceUpdate!.currentBalanceCents).toBe(50000);
  });

  it("sets balance from transaction sum when provider does not report a balance", async () => {
    const conn = validConnection();

    mockDbSelect
      .mockReturnValueOnce(selectChain([conn]))
      .mockReturnValueOnce(selectChain([{ metadata: {} }]))
      .mockReturnValueOnce(selectChain([]))
      // Reconciliation: transactions sum to 20000 cents, no reported balance
      .mockReturnValueOnce(selectChain([{ totalSumCents: 20000, nonOffsetSumCents: 20000, manualCount: 0 }]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([{ date: "2026-01-15" }]))
      .mockReturnValueOnce(selectChain([{ metadata: {} }]));

    mockDbInsert
      .mockReturnValueOnce(insertChain([providerAccountRow()]))
      .mockReturnValueOnce(insertChain([financialAccountRow()]))
      .mockReturnValueOnce(insertChain([transactionRow({ amountCents: 20000 })]));

    const capturedSets: unknown[] = [];
    mockDbUpdate.mockImplementation(() => {
      const p = Promise.resolve(undefined);
      return {
        set: vi.fn((setValues: unknown) => {
          capturedSets.push(setValues);
          return { where: vi.fn(() => p), then: p.then.bind(p), catch: p.catch.bind(p) };
        }),
      };
    });
    mockDbDelete.mockImplementation(() => deleteChain());

    mockGetSession.mockResolvedValue({ accounts: ["acct-1"], aspsp: { name: "Test Bank" } });
    mockGetAccountDetails.mockResolvedValue({ uid: "acct-1", name: "Test", currency: "NOK" });
    // No balance available from provider
    mockGetAccountBalances.mockResolvedValue({ balances: [] });
    mockGetTransactions.mockResolvedValue({ transactions: [{ transaction_id: "raw-tx-1" }] });

    mockMapAccount.mockReturnValue(normalizedAccount({ balance: undefined }));
    mockMapTransaction.mockReturnValue(normalizedTransaction({ amount: "200.00" }));

    const { syncEnableBankingConnection } = await import(
      "@/lib/ingestion/enable-banking/sync"
    );
    await syncEnableBankingConnection("conn-1", {
      syncRunId: "run-1",
      maxPages: 100,
      maxDurationMs: 300_000,
    });

    // Balance set from transaction sum, not a reported balance
    const balanceUpdate = capturedSets.find(
      (s) => typeof s === "object" && s !== null && "currentBalanceCents" in s,
    ) as Record<string, unknown> | undefined;
    expect(balanceUpdate).toBeDefined();
    expect(balanceUpdate!.currentBalanceCents).toBe(20000);

    // Balance metadata should indicate balance was unavailable
    expect(balanceUpdate!.metadata).toMatchObject({
      balance: expect.objectContaining({ balanceUnavailable: true }),
    });
  });
});
