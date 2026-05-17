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
  authenticatedMutationRateLimit: {},
  enforceActionRateLimit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/audit", () => ({
  AuditAction: {
    ACCOUNT_CONNECT: "account.connect",
    ACCOUNT_UPDATE: "account.update",
    ACCOUNT_DISCONNECT: "account.disconnect",
  },
  writeAuditEvent: vi.fn().mockResolvedValue(undefined),
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
  financialAccounts: { id: "id", householdId: "householdId", isManual: "isManual" },
  transactions: { id: "id", householdId: "householdId", accountId: "accountId" },
}));

import { createAccount, updateAccount, deleteAccount } from "./actions";
import { unauthorizedError } from "@/lib/errors/catalog";

describe("Account Actions — Household Isolation", () => {
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
    it("returns authentication_required when unauthenticated", async () => {
      mockRequireUser.mockRejectedValueOnce(unauthorizedError());

      const result = await createAccount({
        name: "Test",
        kind: "checking",
        currency: "NOK",
        currentBalanceCents: 0,
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("authentication_required");
    });
  });

  describe("createAccount — input validation", () => {
    it("rejects missing name", async () => {
      const result = await createAccount({
        name: "",
        kind: "checking",
        currency: "NOK",
        currentBalanceCents: 0,
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("validation_failed");
    });

    it("succeeds with valid input", async () => {
      dbOps.insertResults = [
        {
          id: "new-acc",
          householdId: HOUSEHOLD_A,
          name: "Test",
          kind: "checking",
          currency: "NOK",
          currentBalanceCents: 10000,
          isManual: true,
        },
      ];

      const result = await createAccount({
        name: "Test",
        kind: "checking",
        currency: "NOK",
        currentBalanceCents: "100.00",
      });

      expect(result.data).toBeDefined();
      expect(result.data!.account.name).toBe("Test");
    });
  });

  describe("updateAccount — cross-household rejection", () => {
    it("rejects update for account from another household", async () => {
      dbOps.updateResults = [];

      const result = await updateAccount({
        accountId: "account-from-household-b",
        data: { name: "Hacked" },
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("not_found");
      expect(result.data).toBeUndefined();
    });

    it("succeeds for account in own household", async () => {
      dbOps.updateResults = [
        {
          id: "acc-1",
          householdId: HOUSEHOLD_A,
          name: "Updated",
          kind: "checking",
        },
      ];

      const result = await updateAccount({
        accountId: "acc-1",
        data: { name: "Updated" },
      });

      expect(result.data).toBeDefined();
      expect(result.data!.account.name).toBe("Updated");
    });
  });

  describe("deleteAccount — cross-household rejection", () => {
    it("rejects deletion of account from another household", async () => {
      dbOps.selectResults = [];

      const result = await deleteAccount({
        accountId: "account-from-household-b",
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("not_found");
    });

    it("rejects deletion of provider-synced account", async () => {
      dbOps.selectResults = [{ id: "acc-synced", isManual: false }];

      const result = await deleteAccount({
        accountId: "acc-synced",
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("forbidden");
      expect(result.error!.message).toContain("disconnected");
    });

    it("succeeds for manual account in own household", async () => {
      dbOps.selectResults = [{ id: "acc-1", isManual: true }];
      dbOps.deleteResults = [];

      const result = await deleteAccount({
        accountId: "acc-1",
      });

      expect(result.data).toBeDefined();
      expect(result.data!.deleted).toBe(true);
    });
  });
});
