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
      selectQueue: [] as unknown[][],
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
  queueEnqueueRateLimit: {},
  enforceActionRateLimit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/audit", () => ({
  AuditAction: {
    BILL_CREATE: "bill.create",
    BILL_UPDATE: "bill.update",
    BILL_REJECT: "bill.reject",
  },
  writeAuditEventAsync: vi.fn(),
}));

const mockSendInngestEvent = vi.fn().mockResolvedValue(undefined);

vi.mock("@/inngest/client", () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/inngest/lib/send-event", () => ({
  sendInngestEvent: (...args: unknown[]) => mockSendInngestEvent(...args),
}));

vi.mock("@/lib/ingestion/pipeline/runs", () => ({
  resolvePipelineRunForSlot: vi.fn().mockResolvedValue({
    id: "pipeline-run-1",
    householdId: "household-a-id",
    kind: "recurring_replay",
    status: "queued",
  }),
}));

vi.mock("@/db", () => {
  const nextSelectResults = () => {
    if (dbOps.selectQueue.length > 0) {
      return dbOps.selectQueue.shift() ?? [];
    }
    return dbOps.selectResults;
  };

  const createChain = (getResults: () => unknown[]) => {
    const chain: Record<string, unknown> = {};
    const methods = ["from", "where", "set", "values", "returning", "limit", "innerJoin", "leftJoin", "orderBy"];
    for (const method of methods) {
      chain[method] = vi.fn().mockReturnValue(chain);
    }
    // Make chain thenable (awaitable)
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(getResults()).then(resolve);
    return chain;
  };

  return {
    db: {
      select: vi.fn().mockImplementation(() => createChain(nextSelectResults)),
      update: vi.fn().mockImplementation(() => createChain(() => dbOps.updateResults)),
      delete: vi.fn().mockImplementation(() => createChain(() => dbOps.deleteResults)),
      insert: vi.fn().mockImplementation(() => createChain(() => dbOps.insertResults)),
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => {
        const tx = {
          select: vi.fn().mockImplementation(() => createChain(nextSelectResults)),
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
  recurringBills: { id: "id", householdId: "householdId" },
  recurringBillHistory: { id: "id", billId: "billId", transactionId: "transactionId" },
  transactions: { id: "id", householdId: "householdId" },
  categories: { id: "id", householdId: "householdId" },
  financialAccounts: { id: "id" },
  householdPipelineRuns: {
    id: "id",
    householdId: "householdId",
    kind: "kind",
    status: "status",
    connectionId: "connectionId",
    syncRunId: "syncRunId",
    startedAt: "startedAt",
  },
  ingestionConnections: { id: "id", householdId: "householdId" },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

import {
  createBill,
  updateBill,
  rejectBill,
  updateBillCategory,
  detectRecurringBills,
  getBillTransactions,
  getUnlinkedTransactionsForBill,
  linkTransactionToBill,
} from "./actions";
import { EVENT_NAMES } from "@/inngest/lib/events";
import { unauthorizedError } from "@/lib/errors/catalog";

describe("Bill Actions — Household Isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue(USER_A);
    mockGetActiveHousehold.mockResolvedValue({
      householdId: HOUSEHOLD_A,
      currency: "NOK",
      role: "owner",
    });
    dbOps.selectResults = [];
    dbOps.selectQueue = [];
    dbOps.updateResults = [];
    dbOps.deleteResults = [];
    dbOps.insertResults = [];
  });

  describe("authentication boundary", () => {
    it("returns authentication_required error when unauthenticated", async () => {
      mockRequireUser.mockRejectedValueOnce(unauthorizedError());

      const result = await createBill({
        name: "Netflix",
        merchantPattern: "netflix",
        cadence: "monthly",
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("authentication_required");
      expect(result.data).toBeUndefined();
    });
  });

  describe("createBill — input validation", () => {
    it("rejects invalid input missing name", async () => {
      const result = await createBill({} as never);

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("validation_failed");
      expect(result.data).toBeUndefined();
    });
  });

  describe("updateBill — household scoping", () => {
    it("rejects bill ID from another household (not found)", async () => {
      dbOps.selectResults = [];

      const result = await updateBill({
        billId: "bill-from-other-hh",
        data: { name: "Hacked" },
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("not_found");
      expect(result.data).toBeUndefined();
    });
  });

  describe("rejectBill — household scoping", () => {
    it("rejects bill from another household", async () => {
      dbOps.selectResults = [];

      const result = await rejectBill({ billId: "bill-from-other-hh" });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("not_found");
      expect(result.data).toBeUndefined();
    });
  });

  describe("updateBillCategory — foreign key ownership", () => {
    it("rejects bill from another household", async () => {
      dbOps.selectResults = [];

      const result = await updateBillCategory({
        billId: "other-hh-bill",
        data: { categoryId: "cat-1", applyToTransactions: false },
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("not_found");
      expect(result.data).toBeUndefined();
    });
  });

  describe("getBillTransactions — household scoping", () => {
    it("rejects bill from another household", async () => {
      dbOps.selectResults = [];

      const result = await getBillTransactions({ billId: "other-hh-bill" });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("not_found");
      expect(result.data).toBeUndefined();
    });
  });

  describe("detectRecurringBills — authentication", () => {
    it("returns data when authenticated", async () => {
      const result = await detectRecurringBills({});

      expect(result.data).toBeDefined();
      expect(result.data!.queued).toBe(true);
      expect(result.data!.replayUnapproved).toBe(false);
    });

    it("queues replay when replayUnapproved is true", async () => {
      mockSendInngestEvent.mockClear();

      const result = await detectRecurringBills({ replayUnapproved: true });

      expect(result.data?.replayUnapproved).toBe(true);
      expect(mockSendInngestEvent).toHaveBeenCalledWith(
        EVENT_NAMES.detectRecurringBills,
        expect.objectContaining({
          householdId: HOUSEHOLD_A,
          replayUnapproved: true,
        }),
      );
    });
  });

  describe("linkTransactionToBill — household scoping", () => {
    it("rejects bill from another household", async () => {
      dbOps.selectResults = [];

      const result = await linkTransactionToBill({
        billId: "other-hh-bill",
        transactionId: "txn-1",
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("not_found");
    });

    it("rejects transaction from another household", async () => {
      dbOps.selectQueue = [
        [
          {
            id: "bill-a",
            householdId: HOUSEHOLD_A,
            amountTrend: "stable",
            transactionCount: 1,
            nextDueDate: null,
            typicalDayOfMonth: null,
            cadence: "monthly",
            merchantPattern: "acme",
            expectedAmountCents: null,
            originalCurrency: null,
            pattern: null,
          },
        ],
        [],
      ];

      const result = await linkTransactionToBill({
        billId: "bill-a",
        transactionId: "other-hh-txn",
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("not_found");
    });
  });

  describe("linkTransactionToBill — validation", () => {
    it("rejects positive amount transactions", async () => {
      dbOps.selectQueue = [
        [
          {
            id: "bill-a",
            householdId: HOUSEHOLD_A,
            amountTrend: "stable",
            transactionCount: 1,
            nextDueDate: null,
            typicalDayOfMonth: 15,
            cadence: "monthly",
            merchantPattern: "acme",
            expectedAmountCents: null,
            originalCurrency: null,
            pattern: "day_of_month",
          },
        ],
        [
          {
            id: "txn-1",
            amountCents: 5000,
            excludedFromBudget: false,
            date: "2025-01-01",
            originalAmountCents: null,
            originalCurrency: null,
          },
        ],
      ];

      const result = await linkTransactionToBill({
        billId: "bill-a",
        transactionId: "txn-1",
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("validation_failed");
    });

    it("rejects already linked transactions", async () => {
      dbOps.selectQueue = [
        [
          {
            id: "bill-a",
            householdId: HOUSEHOLD_A,
            amountTrend: "stable",
            transactionCount: 1,
            nextDueDate: null,
            typicalDayOfMonth: 15,
            cadence: "monthly",
            merchantPattern: "acme",
            expectedAmountCents: null,
            originalCurrency: null,
            pattern: "day_of_month",
          },
        ],
        [
          {
            id: "txn-1",
            amountCents: -5000,
            excludedFromBudget: false,
            date: "2025-01-01",
            originalAmountCents: null,
            originalCurrency: null,
          },
        ],
        [{ billId: "bill-b" }],
      ];

      const result = await linkTransactionToBill({
        billId: "bill-a",
        transactionId: "txn-1",
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("conflict");
    });
  });

  describe("getUnlinkedTransactionsForBill — household scoping", () => {
    it("rejects bill from another household", async () => {
      dbOps.selectResults = [];

      const result = await getUnlinkedTransactionsForBill({
        billId: "other-hh-bill",
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("not_found");
    });
  });
});
