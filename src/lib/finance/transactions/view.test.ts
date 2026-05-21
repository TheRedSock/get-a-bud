import { buildTransactionViewFields } from "@/lib/finance/transactions/view";
import { toUpdateTransactionPayload } from "@/lib/finance/validation";

describe("buildTransactionViewFields", () => {
  it("marks synced transactions as non-editable for amount and date", () => {
    const fields = buildTransactionViewFields({
      source: "enable_banking",
      categoryId: "cat-1",
      categorySource: "user",
    });

    expect(fields.canEditAmount).toBe(false);
    expect(fields.canEditDate).toBe(false);
    expect(fields.classificationState).toBe("user_confirmed");
  });

  it("allows manual transactions to edit core facts", () => {
    const fields = buildTransactionViewFields({
      source: "manual",
      categoryId: null,
      suggestedCategoryId: "cat-suggest",
    });

    expect(fields.canEditAmount).toBe(true);
    expect(fields.canEditDate).toBe(true);
    expect(fields.classificationState).toBe("suggestion");
  });
});

describe("toUpdateTransactionPayload", () => {
  it("parses amount strings into integer cents for manual edits", () => {
    const payload = toUpdateTransactionPayload(
      {
        description: "Coffee",
        merchantName: "",
        notes: "",
        categoryId: null,
        status: "posted",
        excludedFromBudget: false,
        amountCents: "12.50",
        date: "2026-01-01",
      },
      { includeAmount: true, includeDate: true },
    );

    expect(payload.amountCents).toBe(1250);
    expect(payload.date).toBe("2026-01-01");
  });
});
