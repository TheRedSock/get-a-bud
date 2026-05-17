import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted constants (available inside vi.mock factories)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/auth/session", () => ({
  requireUser: mockRequireUser,
  getCurrentUser: mockRequireUser,
}));

vi.mock("@/lib/finance/household", () => ({
  getActiveHousehold: mockGetActiveHousehold,
}));

vi.mock("@/lib/security/arcjet", () => ({
  authenticatedMutationRateLimit: {},
  bulkOperationRateLimit: {},
  queueEnqueueRateLimit: {},
  enforceActionRateLimit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/audit", () => ({
  AuditAction: {
    TRANSACTION_CREATE: "transaction.create",
    TRANSACTION_UPDATE: "transaction.update",
    TRANSACTION_DELETE: "transaction.delete",
    TRANSACTION_ENRICH: "transaction.enrich",
    TRANSACTION_CLASSIFY: "transaction.classify",
    TRANSACTION_BULK_APPROVE: "transaction.bulk_approve",
  },
  writeAuditEvent: vi.fn().mockResolvedValue(undefined),
  writeAuditEventAsync: vi.fn(),
}));

vi.mock("@/inngest/client", () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/lib/finance/balance", () => ({
  recalculateAccountBalance: vi.fn().mockResolvedValue(0),
}));

vi.mock("@/lib/finance/categorization", () => ({
  detectCategory: vi.fn().mockResolvedValue(null),
  normalizeMerchant: vi.fn().mockReturnValue("merchant"),
}));

vi.mock("@/lib/finance/merchants", () => ({
  resolveMerchantIdentity: vi.fn().mockResolvedValue(undefined),
  updateMerchantCanonicalName: vi.fn().mockResolvedValue(undefined),
  upsertMerchantFromUserCorrection: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/finance/transactions", () => ({
  buildSuggestionApprovalValues: vi.fn().mockReturnValue({}),
  buildUndoAutoLabelValues: vi.fn().mockReturnValue({}),
  incrementCorrectionsAndRetrain: vi.fn().mockResolvedValue(undefined),
  learnFromCategoryCorrection: vi.fn().mockResolvedValue(undefined),
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
  categories: { id: "id", householdId: "householdId" },
  financialAccounts: { id: "id", householdId: "householdId" },
  transactions: { id: "id", householdId: "householdId", accountId: "accountId" },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

import {
  createTransaction,
  updateTransaction,
  deleteTransaction,
  approveSuggestion,
  rejectSuggestion,
  undoAutoLabel,
} from "./actions";
import { unauthorizedError } from "@/lib/errors/catalog";

describe("Transaction Actions — Household Isolation", () => {
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

      const result = await createTransaction({
        accountId: "acc-1",
        amountCents: "50.00",
        date: "2025-01-15",
        description: "Test",
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("authentication_required");
      expect(result.data).toBeUndefined();
    });
  });

  describe("createTransaction — foreign key ownership", () => {
    it("rejects accountId from another household", async () => {
      dbOps.selectResults = [];

      const result = await createTransaction({
        accountId: "account-from-household-b",
        amountCents: "50.00",
        currency: "NOK",
        date: "2025-01-15",
        description: "Grocery shopping",
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("not_found");
      expect(result.error!.message).toContain("account");
      expect(result.data).toBeUndefined();
    });
  });

  describe("updateTransaction — household scoping", () => {
    it("rejects transaction ID from another household (not found)", async () => {
      dbOps.selectResults = [];

      const result = await updateTransaction({
        transactionId: "tx-from-household-b",
        data: { description: "Hacked" },
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("not_found");
      expect(result.data).toBeUndefined();
    });
  });

  describe("deleteTransaction — household scoping", () => {
    it("rejects deletion of transaction from another household", async () => {
      dbOps.deleteResults = [];

      const result = await deleteTransaction({
        transactionId: "tx-from-household-b",
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("not_found");
      expect(result.data).toBeUndefined();
    });

    it("succeeds for transaction in own household", async () => {
      dbOps.deleteResults = [{ id: "tx-1", accountId: "acc-1" }];

      const result = await deleteTransaction({
        transactionId: "tx-1",
      });

      expect(result.data).toBeDefined();
      expect(result.data!.deleted).toBe(true);
    });
  });

  describe("input validation", () => {
    it("rejects empty transactionId for update", async () => {
      const result = await updateTransaction({
        transactionId: "",
        data: { description: "Test" },
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("validation_failed");
    });

    it("rejects missing required fields for create", async () => {
      const result = await createTransaction({
        accountId: "acc-1",
      } as never);

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("validation_failed");
    });
  });

  describe("approveSuggestion — household scoping", () => {
    it("rejects transaction ID from another household", async () => {
      dbOps.selectResults = [];

      const result = await approveSuggestion({
        transactionId: "tx-from-household-b",
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("not_found");
      expect(result.data).toBeUndefined();
    });

    it("rejects when no suggestion exists", async () => {
      dbOps.selectResults = [{
        id: "tx-1",
        householdId: HOUSEHOLD_A,
        suggestedCategoryId: null,
      }];

      const result = await approveSuggestion({
        transactionId: "tx-1",
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("validation_failed");
    });
  });

  describe("rejectSuggestion — household scoping", () => {
    it("rejects transaction ID from another household", async () => {
      dbOps.selectResults = [];

      const result = await rejectSuggestion({
        transactionId: "tx-from-household-b",
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("not_found");
      expect(result.data).toBeUndefined();
    });

    it("rejects when no suggestion exists", async () => {
      dbOps.selectResults = [{
        id: "tx-1",
        householdId: HOUSEHOLD_A,
        suggestedCategoryId: null,
      }];

      const result = await rejectSuggestion({
        transactionId: "tx-1",
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("validation_failed");
    });
  });

  describe("undoAutoLabel — household scoping", () => {
    it("rejects transaction ID from another household", async () => {
      dbOps.selectResults = [];

      const result = await undoAutoLabel({
        transactionId: "tx-from-household-b",
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("not_found");
      expect(result.data).toBeUndefined();
    });
  });
});
