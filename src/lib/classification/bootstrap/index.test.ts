import { describe, expect, it } from "vitest";

import {
  suggestFromBootstrapRules,
  type BootstrapTransaction,
} from "@/lib/classification/bootstrap";

function txn(
  input: Partial<BootstrapTransaction>,
): BootstrapTransaction {
  return {
    id: "txn_1",
    householdId: "household_1",
    source: "enable_banking",
    description: "",
    merchantName: null,
    normalizedMerchantName: null,
    transactionType: null,
    paymentChannel: null,
    metadata: null,
    ...input,
  };
}

const categories = new Map([
  ["Groceries", "cat_groceries"],
  ["Salary", "cat_salary"],
  ["Transfers", "cat_transfers"],
]);

describe("suggestFromBootstrapRules", () => {
  it("suggests from conservative default merchant rules", () => {
    const suggestion = suggestFromBootstrapRules(
      txn({ merchantName: "KIWI 425 Rodtvet" }),
      categories,
    );

    expect(suggestion).toMatchObject({
      categoryId: "cat_groceries",
      source: "bootstrap_rule",
    });
  });

  it("supports source-specific cold-start rules", () => {
    const suggestion = suggestFromBootstrapRules(
      txn({ description: "Lønn fra Arbeidsgiver AS" }),
      categories,
    );

    expect(suggestion).toMatchObject({
      categoryId: "cat_salary",
      reason: "enable-banking-salary-description",
    });
  });

  it("suggests transfers from parsed transaction type", () => {
    const suggestion = suggestFromBootstrapRules(
      txn({ transactionType: "internal_transfer" }),
      categories,
    );

    expect(suggestion).toMatchObject({
      categoryId: "cat_transfers",
      reason: "type-internal-transfer",
    });
  });

  it("returns null when no category exists for a matched rule", () => {
    const suggestion = suggestFromBootstrapRules(
      txn({ merchantName: "KIWI 425 Rodtvet" }),
      new Map(),
    );

    expect(suggestion).toBeNull();
  });
});
