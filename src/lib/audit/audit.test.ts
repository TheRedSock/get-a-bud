import { AuditAction, type AuditEventInput } from "./types";

// Mock the database
vi.mock("@/db", () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

vi.mock("@/db/schema", () => ({
  auditEvents: { id: "audit_events" },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
  },
}));

describe("audit writer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writeAuditEvent inserts correct values", async () => {
    const { db } = await import("@/db");
    const { writeAuditEvent } = await import("./writer");

    const mockValues = vi.fn().mockResolvedValue(undefined);
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: mockValues,
    });

    const input: AuditEventInput = {
      householdId: "hh-1",
      actorUserId: "user-1",
      action: AuditAction.TRANSACTION_CREATE,
      resourceType: "transaction",
      resourceId: "tx-1",
      outcome: "success",
      requestId: "req-1",
      ipHash: "abc123",
      metadata: { operation: "test" },
    };

    await writeAuditEvent(input);

    expect(db.insert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith({
      householdId: "hh-1",
      actorUserId: "user-1",
      action: "transaction.create",
      resourceType: "transaction",
      resourceId: "tx-1",
      outcome: "success",
      requestId: "req-1",
      ipHash: "abc123",
      metadata: { operation: "test" },
    });
  });

  it("writeAuditEvent defaults optional fields to null", async () => {
    const { db } = await import("@/db");
    const { writeAuditEvent } = await import("./writer");

    const mockValues = vi.fn().mockResolvedValue(undefined);
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: mockValues,
    });

    const input: AuditEventInput = {
      householdId: "hh-1",
      actorUserId: "user-1",
      action: AuditAction.BUDGET_CREATE,
      resourceType: "budget",
      outcome: "success",
    };

    await writeAuditEvent(input);

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId: null,
        requestId: null,
        ipHash: null,
        metadata: null,
      }),
    );
  });

  it("writeAuditEventAsync does not propagate errors", async () => {
    const { db } = await import("@/db");
    const { logger } = await import("@/lib/logger");
    const { writeAuditEventAsync } = await import("./writer");

    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: vi.fn().mockRejectedValue(new Error("DB connection failed")),
    });

    const input: AuditEventInput = {
      householdId: "hh-1",
      actorUserId: "user-1",
      action: AuditAction.ACCOUNT_UPDATE,
      resourceType: "financial_account",
      outcome: "success",
    };

    // Should not throw
    writeAuditEventAsync(input);

    // Wait for the async error handler
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(logger.warn).toHaveBeenCalledWith(
      "Audit event write failed",
      expect.objectContaining({
        action: "account.update",
        error: "DB connection failed",
      }),
    );
  });
});

describe("audit action types", () => {
  it("has expected action values", () => {
    expect(AuditAction.TRANSACTION_CREATE).toBe("transaction.create");
    expect(AuditAction.TRANSACTION_BULK_APPROVE).toBe("transaction.bulk_approve");
    expect(AuditAction.ASSET_CREATE).toBe("asset.create");
    expect(AuditAction.LIABILITY_CREATE).toBe("liability.create");
    expect(AuditAction.PROVIDER_SYNC_START).toBe("provider.sync_start");
    expect(AuditAction.ACCESS_DENIED).toBe("security.access_denied");
  });
});
