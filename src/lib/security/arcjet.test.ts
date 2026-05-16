/**
 * Tests verifying that Arcjet rate limiting denials result in 429 responses
 * and prevent business logic from executing.
 */
import { describe, expect, it, vi } from "vitest";

// --- Shared mocks ---

const mockDb = vi.hoisted(() => ({
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve([])),
        orderBy: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([])) })),
      })),
    })),
  })),
  insert: vi.fn(() => ({
    values: vi.fn(() => ({
      returning: vi.fn(() => Promise.resolve([{ id: "txn-1" }])),
    })),
  })),
}));

vi.mock("@/db", () => ({ db: mockDb }));

vi.mock("@/config/env", () => ({
  serverEnv: {
    DATABASE_URL: "postgresql://stub:stub@localhost/stub",
    NEXTAUTH_SECRET: "stub",
    NEXTAUTH_URL: "http://localhost:3000",
    FIELD_ENCRYPTION_KEY: "stub",
    NODE_ENV: "test",
  },
  publicEnv: {},
}));

vi.mock("@/lib/finance/household", () => ({
  getActiveHousehold: vi.fn().mockResolvedValue({
    householdId: "hh-1",
    role: "owner",
    householdName: "Test",
    currency: "NOK",
    theme: null,
  }),
}));

vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn().mockResolvedValue({ id: "user-1" }),
}));

vi.mock("@/lib/audit", () => ({
  AuditAction: { TRANSACTION_CREATE: "transaction.create" },
  writeAuditEventAsync: vi.fn(),
}));

vi.mock("@/lib/finance/categorization", () => ({
  detectCategory: vi.fn().mockResolvedValue(null),
  normalizeMerchant: vi.fn().mockReturnValue("test"),
}));

vi.mock("@/lib/finance/balance", () => ({
  recalculateAccountBalance: vi.fn(),
}));

vi.mock("@/inngest/client", () => ({
  inngest: { send: vi.fn() },
}));

// Mock Arcjet with DENY decisions
vi.mock("@/lib/security/arcjet", () => ({
  authenticatedMutationRateLimit: {
    protect: vi.fn().mockResolvedValue({ isDenied: () => true }),
  },
  bulkOperationRateLimit: {
    protect: vi.fn().mockResolvedValue({ isDenied: () => true }),
  },
  queueEnqueueRateLimit: {
    protect: vi.fn().mockResolvedValue({ isDenied: () => true }),
  },
  registerRateLimit: {
    protect: vi.fn().mockResolvedValue({ isDenied: () => true }),
  },
  authRateLimit: {
    protect: vi.fn().mockResolvedValue({ isDenied: () => true }),
  },
  integrationAuthRateLimit: {
    protect: vi.fn().mockResolvedValue({ isDenied: () => true }),
  },
}));

function makeRequest(url: string, body?: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("Arcjet rate limiting denials", () => {
  it("POST /api/transactions returns 429 on rate limit", async () => {
    const { POST } = await import("@/app/api/transactions/route");
    const request = makeRequest("http://localhost/api/transactions", {
      accountId: "acc-1",
      amount: -10,
      currency: "NOK",
      date: "2026-01-01",
      description: "test",
    });

    const response = await POST(request, {} as never);
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error.code).toBe("rate_limited");
  });

  it("POST /api/transactions does not execute business logic on denial", async () => {
    const { POST } = await import("@/app/api/transactions/route");
    const request = makeRequest("http://localhost/api/transactions", {
      accountId: "acc-1",
      amount: -10,
      currency: "NOK",
      date: "2026-01-01",
      description: "test",
    });

    await POST(request, {} as never);

    // DB insert should never be called — rate limit blocks before business logic
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("POST /api/transactions/classify returns 429 on rate limit", async () => {
    const { POST } = await import("@/app/api/transactions/classify/route");
    const request = makeRequest("http://localhost/api/transactions/classify");

    const response = await POST(request, {} as never);
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error.code).toBe("rate_limited");
  });

  it("POST /api/bills/detect returns 429 on rate limit", async () => {
    const { POST } = await import("@/app/api/bills/detect/route");
    const request = makeRequest("http://localhost/api/bills/detect");

    const response = await POST(request, {} as never);
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error.code).toBe("rate_limited");
  });
});
