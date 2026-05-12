/**
 * Test category household ownership validation (P0-2).
 * Mocks the database layer and household auth to isolate the ownership check.
 */

export {};

const dbState = vi.hoisted(() => ({
  selectResults: [] as unknown[][],
  insertResult: [
    { id: "txn-new", householdId: "hh-1", accountId: "acc-1" },
  ] as unknown[],
  select: vi.fn(),
  insert: vi.fn(),
}));

dbState.select.mockImplementation(() => ({
  from: vi.fn(() => ({
    where: vi.fn(() => ({
      limit: vi.fn(() => Promise.resolve(dbState.selectResults.shift() ?? [])),
    })),
  })),
}));

dbState.insert.mockImplementation(() => ({
  values: vi.fn(() => ({
    returning: vi.fn(() => Promise.resolve(dbState.insertResult)),
  })),
}));

vi.mock("@/db", () => ({
  db: {
    select: dbState.select,
    insert: dbState.insert,
  },
}));

vi.mock("@/lib/finance/household", () => ({
  getActiveHousehold: vi.fn().mockResolvedValue({
    householdId: "hh-1",
    role: "owner",
    householdName: "Test Budget",
    currency: "NOK",
    theme: null,
  }),
}));

vi.mock("@/lib/finance/categorization", () => ({
  detectCategory: vi.fn().mockResolvedValue(null),
  normalizeMerchant: vi.fn().mockReturnValue("test merchant"),
}));

vi.mock("@/lib/security/arcjet", () => ({
  registerRateLimit: { protect: vi.fn().mockResolvedValue({ isDenied: () => false }) },
  authRateLimit: { protect: vi.fn().mockResolvedValue({ isDenied: () => false }) },
  integrationAuthRateLimit: { protect: vi.fn().mockResolvedValue({ isDenied: () => false }) },
}));

vi.mock("@/lib/finance/balance", () => ({
  recalculateAccountBalance: vi.fn().mockResolvedValue("0"),
}));

const { POST } = await import("@/app/api/transactions/route");

describe("transaction category ownership (P0-2)", () => {
  afterEach(() => {
    dbState.selectResults = [];
    dbState.insertResult = [
      { id: "txn-new", householdId: "hh-1", accountId: "acc-1" },
    ];
    vi.clearAllMocks();
  });

  describe("POST /api/transactions", () => {
    it("rejects a categoryId from another household", async () => {
      dbState.selectResults = [
        [{ id: "acc-1", householdId: "hh-1" }],
        [],
      ];

      const request = new Request("http://localhost:3000/api/transactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountId: "acc-1",
          categoryId: "foreign-cat-id",
          amount: -42,
          currency: "NOK",
          date: "2026-05-10",
          description: "Test transaction",
        }),
      });

      const response = await POST(request, {} as never);
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.error.message).toMatch(/category/i);
    });

    it("allows a categoryId from the same household", async () => {
      dbState.selectResults = [
        [{ id: "acc-1", householdId: "hh-1" }],
        [{ id: "cat-1" }],
      ];
      dbState.insertResult = [
        {
          id: "txn-new",
          householdId: "hh-1",
          accountId: "acc-1",
          categoryId: "cat-1",
        },
      ];

      const request = new Request("http://localhost:3000/api/transactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountId: "acc-1",
          categoryId: "cat-1",
          amount: -42,
          currency: "NOK",
          date: "2026-05-10",
          description: "Test transaction",
        }),
      });

      const response = await POST(request, {} as never);
      expect(response.status).toBe(201);
    });
  });
});
