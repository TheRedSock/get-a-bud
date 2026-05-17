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
    BUDGET_CREATE: "budget.create",
    BUDGET_UPDATE: "budget.update",
    BUDGET_DELETE: "budget.delete",
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
  budgets: { id: "id", householdId: "householdId" },
}));

import { createBudget, updateBudget, deleteBudget } from "./actions";
import { unauthorizedError } from "@/lib/errors/catalog";

describe("Budget Actions — Household Isolation", () => {
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

      const result = await createBudget({
        name: "Test",
        type: "monthly",
        currency: "NOK",
        periodStartDay: 1,
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("authentication_required");
    });
  });

  describe("createBudget — input validation", () => {
    it("rejects missing name", async () => {
      const result = await createBudget({
        name: "",
        type: "monthly",
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("validation_failed");
    });

    it("succeeds with valid input", async () => {
      dbOps.insertResults = [
        {
          id: "budget-1",
          householdId: HOUSEHOLD_A,
          name: "Groceries",
          type: "monthly",
          currency: "NOK",
          periodStartDay: 1,
          isActive: true,
        },
      ];

      const result = await createBudget({
        name: "Groceries",
        type: "monthly",
        currency: "NOK",
        periodStartDay: 1,
      });

      expect(result.data).toBeDefined();
      expect(result.data!.budget.name).toBe("Groceries");
    });
  });

  describe("updateBudget — cross-household rejection", () => {
    it("rejects update for budget from another household", async () => {
      dbOps.updateResults = [];

      const result = await updateBudget({
        budgetId: "budget-from-household-b",
        data: { name: "Hacked" },
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("not_found");
      expect(result.data).toBeUndefined();
    });

    it("succeeds for budget in own household", async () => {
      dbOps.updateResults = [
        {
          id: "budget-1",
          householdId: HOUSEHOLD_A,
          name: "Updated",
          type: "monthly",
        },
      ];

      const result = await updateBudget({
        budgetId: "budget-1",
        data: { name: "Updated" },
      });

      expect(result.data).toBeDefined();
      expect(result.data!.budget.name).toBe("Updated");
    });
  });

  describe("deleteBudget — cross-household rejection", () => {
    it("rejects deletion of budget from another household", async () => {
      dbOps.deleteResults = [];

      const result = await deleteBudget({
        budgetId: "budget-from-household-b",
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("not_found");
    });

    it("succeeds for budget in own household", async () => {
      dbOps.deleteResults = [{ id: "budget-1" }];

      const result = await deleteBudget({
        budgetId: "budget-1",
      });

      expect(result.data).toBeDefined();
      expect(result.data!.deleted).toBe(true);
    });
  });
});
