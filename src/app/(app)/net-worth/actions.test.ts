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
    ASSET_CREATE: "asset.create",
    ASSET_UPDATE: "asset.update",
    LIABILITY_CREATE: "liability.create",
    LIABILITY_UPDATE: "liability.update",
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
  assets: { id: "id", householdId: "householdId" },
  liabilities: { id: "id", householdId: "householdId" },
}));

import { createAsset, createLiability, updateAsset, updateLiability } from "./actions";
import { unauthorizedError } from "@/lib/errors/catalog";

describe("Net Worth Actions — Household Isolation", () => {
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

      const result = await createAsset({
        name: "House",
        kind: "real_estate",
        currency: "NOK",
        estimatedValueCents: "5000000.00",
        valuationDate: "2025-01-01",
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("authentication_required");
    });
  });

  describe("createAsset — input validation", () => {
    it("rejects missing required fields", async () => {
      const result = await createAsset({} as never);

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("validation_failed");
    });

    it("succeeds with valid input", async () => {
      dbOps.insertResults = [
        {
          id: "asset-1",
          householdId: HOUSEHOLD_A,
          name: "House",
          kind: "real_estate",
          currency: "NOK",
          estimatedValueCents: 500000000,
          valuationDate: "2025-01-01",
          notes: null,
        },
      ];

      const result = await createAsset({
        name: "House",
        kind: "real_estate",
        currency: "NOK",
        estimatedValueCents: "5000000.00",
        valuationDate: "2025-01-01",
      });

      expect(result.data).toBeDefined();
      expect(result.data!.asset).toBeDefined();
    });
  });

  describe("createLiability — input validation", () => {
    it("rejects missing required fields", async () => {
      const result = await createLiability({} as never);

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("validation_failed");
    });
  });

  describe("updateAsset — household scoping", () => {
    it("rejects asset ID from another household", async () => {
      dbOps.updateResults = [];

      const result = await updateAsset({
        assetId: "asset-from-other-hh",
        data: { name: "Stolen" },
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("not_found");
    });

    it("succeeds for asset in own household", async () => {
      dbOps.updateResults = [
        {
          id: "asset-1",
          householdId: HOUSEHOLD_A,
          name: "Updated",
          kind: "real_estate",
          currency: "NOK",
          estimatedValueCents: 600000000,
          valuationDate: "2025-01-01",
          notes: null,
        },
      ];

      const result = await updateAsset({
        assetId: "asset-1",
        data: { name: "Updated" },
      });

      expect(result.data).toBeDefined();
      expect(result.data!.asset).toBeDefined();
    });
  });

  describe("updateLiability — household scoping", () => {
    it("rejects liability ID from another household", async () => {
      dbOps.updateResults = [];

      const result = await updateLiability({
        liabilityId: "liability-from-other-hh",
        data: { name: "Stolen" },
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("not_found");
    });

    it("succeeds for liability in own household", async () => {
      dbOps.updateResults = [
        {
          id: "liab-1",
          householdId: HOUSEHOLD_A,
          name: "Updated Loan",
          kind: "mortgage",
          currency: "NOK",
          currentBalanceCents: 200000000,
          interestRate: "3.5000",
          minimumPaymentCents: 1000000,
          dueDay: 15,
          notes: null,
        },
      ];

      const result = await updateLiability({
        liabilityId: "liab-1",
        data: { name: "Updated Loan" },
      });

      expect(result.data).toBeDefined();
      expect(result.data!.liability).toBeDefined();
    });
  });
});
