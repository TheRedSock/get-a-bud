import { describe, it, expect, vi, beforeEach } from "vitest";

const { HOUSEHOLD_A, USER_A, dbOps, mockRequireUser, mockGetActiveHousehold } = vi.hoisted(() => {
  const USER_A = { id: "user-a-id", email: "a@test.com", name: "User A" };
  const HOUSEHOLD_A = "household-a-id";

  // Use globalThis to share mock functions across test files with isolate: false
  const g = globalThis as Record<string, unknown>;
  if (!g.__mockRequireUser) {
    g.__mockRequireUser = vi.fn().mockResolvedValue(USER_A);
  }
  if (!g.__mockGetActiveHousehold) {
    g.__mockGetActiveHousehold = vi.fn().mockResolvedValue({
      householdId: HOUSEHOLD_A,
      currency: "NOK",
      role: "owner",
    });
  }

  return {
    HOUSEHOLD_A,
    USER_A,
    dbOps: {
      selectResults: [] as unknown[],
      updateResults: [] as unknown[],
      deleteResults: [] as unknown[],
      insertResults: [] as unknown[],
    },
    mockRequireUser: g.__mockRequireUser as ReturnType<typeof vi.fn>,
    mockGetActiveHousehold: g.__mockGetActiveHousehold as ReturnType<typeof vi.fn>,
  };
});

vi.mock("@/lib/auth/session", () => ({
  requireUser: mockRequireUser,
  getCurrentUser: mockRequireUser,
}));

vi.mock("@/lib/finance/household", () => ({
  getActiveHousehold: mockGetActiveHousehold,
}));

vi.mock("@/lib/security/arcjet", () => ({
  integrationAuthRateLimit: {},
  queueEnqueueRateLimit: {},
  enforceActionRateLimit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/auth/step-up", () => ({
  requireStepUp: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/audit", () => ({}));

vi.mock("@/config/env", () => ({
  serverEnv: { ENABLE_BANKING_BASE_URL: "https://api.test.enablebanking.com" },
}));

vi.mock("@/inngest/client", () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/lib/security/encryption", () => ({
  encryptSecret: vi.fn().mockReturnValue({ ciphertext: "enc", iv: "iv", tag: "tag" }),
  decryptSecret: vi.fn().mockReturnValue("mock-pem-key"),
}));

vi.mock("@/lib/ingestion/enable-banking/client", () => ({
  EnableBankingClient: class {
    startAuthorization = vi.fn().mockResolvedValue({
      authorization_id: "auth-123",
      url: "https://bank.example.com/auth",
      psu_id_hash: "hash123",
    });
  },
}));

vi.mock("@/lib/ingestion/enable-banking/psu-headers", () => ({
  capturePsuHeaders: vi.fn().mockReturnValue({}),
}));

vi.mock("@/lib/ingestion/sync-runs", () => ({
  resolveSyncRunForEnqueue: vi.fn().mockResolvedValue({
    id: "run-1",
    connectionId: "conn-1",
    status: "queued",
  }),
}));

vi.mock("@/lib/ingestion/enable-banking/state", () => ({
  createAuthorizationState: vi.fn().mockReturnValue({
    state: "state-abc",
    stateHash: "hash-abc",
    expiresAt: "2025-02-01T00:00:00Z",
  }),
  getAppUrl: vi.fn().mockReturnValue("http://localhost:3000"),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(
    new Map([
      ["referer", "http://localhost:3000/settings"],
      ["host", "localhost:3000"],
    ]),
  ),
}));

vi.mock("@/db", () => {
  const createChain = (getResults: () => unknown[]) => {
    const chain: Record<string, unknown> = {};
    const methods = ["from", "where", "set", "values", "returning", "limit", "innerJoin", "leftJoin"];
    for (const method of methods) {
      chain[method] = vi.fn().mockReturnValue(chain);
    }
    // Make chain thenable (awaitable)
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(getResults()).then(resolve);
    return chain;
  };

  return {
    db: {
      select: vi.fn().mockImplementation(() => createChain(() => dbOps.selectResults)),
      update: vi.fn().mockImplementation(() => createChain(() => dbOps.updateResults)),
      delete: vi.fn().mockImplementation(() => createChain(() => dbOps.deleteResults)),
      insert: vi.fn().mockImplementation(() => createChain(() => dbOps.insertResults)),
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => {
        const tx = {
          select: vi.fn().mockImplementation(() => createChain(() => dbOps.selectResults)),
          update: vi.fn().mockImplementation(() => createChain(() => dbOps.updateResults)),
          delete: vi.fn().mockImplementation(() => createChain(() => dbOps.deleteResults)),
          insert: vi.fn().mockImplementation(() => createChain(() => dbOps.insertResults)),
        };
        return fn(tx);
      }),
    },
  };
});

vi.mock("@/db/schema", () => ({
  ingestionConnections: { id: "id", householdId: "householdId", consentSessionId: "consentSessionId" },
  syncRuns: { id: "id", connectionId: "connectionId" },
}));

import { createEnableBankingConnection, startEnableBankingAuth, queueEnableBankingSync } from "./actions";
import { unauthorizedError } from "@/lib/errors/catalog";

describe("Integration Actions — Household Isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue(USER_A);
    mockGetActiveHousehold.mockResolvedValue({
      householdId: HOUSEHOLD_A,
      currency: "NOK",
      role: "owner",
    });
    dbOps.selectResults = [];
    dbOps.updateResults = [];
    dbOps.deleteResults = [];
    dbOps.insertResults = [];
  });

  describe("authentication boundary", () => {
    it("returns authentication_required error when unauthenticated", async () => {
      mockRequireUser.mockRejectedValueOnce(unauthorizedError());

      const result = await createEnableBankingConnection({
        displayName: "Test",
        applicationId: "app-123",
        pemPrivateKey: "x".repeat(100),
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("authentication_required");
    });
  });

  describe("createEnableBankingConnection — input validation", () => {
    it("rejects missing applicationId", async () => {
      const result = await createEnableBankingConnection({
        displayName: "Test",
        applicationId: "",
        pemPrivateKey: "x".repeat(100),
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("validation_failed");
    });

    it("succeeds with valid input", async () => {
      dbOps.insertResults = [{ id: "conn-1" }];

      const result = await createEnableBankingConnection({
        displayName: "Test",
        applicationId: "app-123",
        pemPrivateKey: "x".repeat(100),
      });

      expect(result.data).toBeDefined();
      expect(result.data!.connection.id).toBeDefined();
    });
  });

  describe("startEnableBankingAuth — household scoping", () => {
    it("rejects connection from another household", async () => {
      dbOps.selectResults = [];

      const result = await startEnableBankingAuth({
        connectionId: "conn-from-other-hh",
        aspspName: "DNB",
        aspspCountry: "NO",
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("not_found");
    });
  });

  describe("queueEnableBankingSync — household scoping", () => {
    it("rejects connection from another household", async () => {
      dbOps.selectResults = [];

      const result = await queueEnableBankingSync({
        connectionId: "conn-from-other-hh",
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("not_found");
    });

    it("rejects connection without consent session", async () => {
      dbOps.selectResults = [{ id: "conn-1", consentSessionId: null }];

      const result = await queueEnableBankingSync({
        connectionId: "conn-1",
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("validation_failed");
    });

    it("succeeds for valid connection with consent", async () => {
      dbOps.selectResults = [{ id: "conn-1", consentSessionId: "session-123" }];
      dbOps.insertResults = [{ id: "run-1" }];

      const result = await queueEnableBankingSync({
        connectionId: "conn-1",
      });

      expect(result.data).toBeDefined();
      expect(result.data!.run).toBeDefined();
    });
  });
});
