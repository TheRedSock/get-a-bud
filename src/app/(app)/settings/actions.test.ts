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

vi.mock("@/lib/security/rate-limit", () => ({
  enforceRateLimit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/audit", () => ({
  AuditAction: {
    CATEGORY_CREATE: "category.create",
    CATEGORY_UPDATE: "category.update",
    CATEGORY_DELETE: "category.delete",
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
  categories: { id: "id", householdId: "householdId", groupId: "groupId", isSystem: "isSystem" },
  categoryGroups: { id: "id", householdId: "householdId" },
}));

import { createCategory, updateCategory, deleteCategory } from "./actions";
import { unauthorizedError } from "@/lib/errors/catalog";

describe("Category Actions — Household Isolation", () => {
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

      const result = await createCategory({
        name: "Test",
        groupId: "group-1",
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("authentication_required");
    });
  });

  describe("createCategory — foreign key ownership", () => {
    it("rejects groupId from another household", async () => {
      dbOps.selectResults = [];

      const result = await createCategory({
        name: "Test Category",
        groupId: "group-from-household-b",
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("not_found");
      expect(result.error!.message).toContain("group");
    });

    it("rejects parentId from another household", async () => {
      dbOps.selectResults = [];

      const result = await createCategory({
        name: "Test Category",
        parentId: "parent-from-household-b",
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("not_found");
      expect(result.error!.message).toContain("parent");
    });
  });

  describe("updateCategory — cross-household rejection", () => {
    it("rejects update for category from another household", async () => {
      dbOps.updateResults = [];

      const result = await updateCategory({
        categoryId: "cat-from-household-b",
        data: { name: "Hacked" },
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("not_found");
    });
  });

  describe("deleteCategory — cross-household and system guard", () => {
    it("rejects deletion of category from another household", async () => {
      dbOps.selectResults = [];

      const result = await deleteCategory({
        categoryId: "cat-from-household-b",
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("not_found");
    });

    it("rejects deletion of system category", async () => {
      dbOps.selectResults = [{ id: "sys-cat", isSystem: true }];

      const result = await deleteCategory({
        categoryId: "sys-cat",
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("forbidden");
      expect(result.error!.message).toContain("System");
    });

    it("succeeds for user-created category in own household", async () => {
      dbOps.selectResults = [{ id: "user-cat", isSystem: false }];
      dbOps.deleteResults = [];

      const result = await deleteCategory({
        categoryId: "user-cat",
      });

      expect(result.data).toBeDefined();
      expect(result.data!.deleted).toBe(true);
    });
  });
});
