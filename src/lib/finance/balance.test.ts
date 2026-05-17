import { recalculateAccountBalance } from "@/lib/finance/balance";

vi.mock("@/db", () => {
  const selectResult = { sum: 15000 };
  return {
    db: {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([selectResult]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    },
    __selectResult: selectResult,
  };
});

describe("recalculateAccountBalance", () => {
  it("returns the SUM of transaction amounts as the new balance in cents", async () => {
    const result = await recalculateAccountBalance({
      accountId: "acc-1",
      householdId: "hh-1",
    });

    expect(result).toBe(15000);
  });
});
