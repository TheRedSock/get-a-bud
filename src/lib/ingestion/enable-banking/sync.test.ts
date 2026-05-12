import { AppError } from "@/lib/errors/app-error";

/**
 * Focused tests for sync.ts entry-point validation and error handling (P1-5).
 * Mocks the database, EB client, and encryption to isolate sync behavior.
 */

// --- Mock DB layer ---
const mockDbSelect = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbInsert = vi.fn();

function mockChainSelect(results: unknown[] = []) {
  return mockDbSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(results),
      }),
    }),
  });
}

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
    update: (...args: unknown[]) => mockDbUpdate(...args),
    insert: (...args: unknown[]) => mockDbInsert(...args),
  },
}));

vi.mock("@/lib/finance/categorization", () => ({
  normalizeMerchant: vi.fn().mockReturnValue("test"),
}));

vi.mock("@/lib/ingestion/enable-banking/client", () => ({
  EnableBankingClient: vi.fn(),
  EnableBankingRateLimitError: class extends Error {},
  mapEnableBankingAccount: vi.fn(),
  mapEnableBankingTransaction: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), exception: vi.fn() },
}));

vi.mock("@/lib/security/encryption", () => ({
  decryptSecret: vi.fn().mockReturnValue("mock-pem"),
}));

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
