import {
  createAccountSchema,
  createTransactionSchema,
} from "@/lib/finance/validation";

describe("finance validation schemas", () => {
  it("normalizes account defaults and currency", () => {
    const parsed = createAccountSchema.parse({
      name: "Everyday",
      currency: "nok",
      currentBalance: "1250.50",
    });

    expect(parsed).toMatchObject({
      name: "Everyday",
      kind: "checking",
      currency: "NOK",
      currentBalance: 1250.5,
    });
  });

  it("requires a transaction description and account", () => {
    const parsed = createTransactionSchema.safeParse({
      amount: "-42",
      date: "2026-05-11",
      description: "",
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.path.join("."))).toEqual(
      expect.arrayContaining(["accountId", "description"]),
    );
  });
});
