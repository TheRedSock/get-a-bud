import "@/test/integration-mocks";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { searchTransactions } from "@/lib/finance/transactions/queries";
import { createTestTransaction, createTwoHouseholds } from "@/test/factories";
import {
  closeIntegrationDb,
  isDatabaseAvailable,
  resetDatabase,
} from "@/test/integration-db";

const dbAvailable = await isDatabaseAvailable();

describe.skipIf(!dbAvailable)("searchTransactions — integration", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closeIntegrationDb();
  });

  it("returns only transactions for the requested household", async () => {
    const { householdA, accountA, householdB, accountB } =
      await createTwoHouseholds();

    await createTestTransaction(householdA.id, accountA.id, {
      description: "Alpha purchase",
      searchText: "alpha purchase",
    });
    await createTestTransaction(householdB.id, accountB.id, {
      description: "Alpha other household",
      searchText: "alpha other household",
    });

    const results = await searchTransactions(householdA.id, "alpha");

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((row) => row.description.includes("Alpha"))).toBe(true);
    expect(
      results.some((row) => row.description.includes("other household")),
    ).toBe(false);
  });
});
