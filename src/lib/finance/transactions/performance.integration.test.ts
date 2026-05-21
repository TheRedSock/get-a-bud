import "@/test/integration-mocks";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { searchTransactions } from "@/lib/finance/transactions/queries";
import { createTestAccount, createTestTransaction, createTwoHouseholds } from "@/test/factories";
import {
  closeIntegrationDb,
  isDatabaseAvailable,
  resetDatabase,
} from "@/test/integration-db";

const dbAvailable = await isDatabaseAvailable();

describe.skipIf(!dbAvailable)("Transaction query performance bounds", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closeIntegrationDb();
  });

  it("search results are bounded regardless of matching row count", async () => {
    const { householdA, accountA } = await createTwoHouseholds();

    // Seed 150 matching transactions (exceeds expected search limit)
    const inserts = Array.from({ length: 150 }, (_, i) =>
      createTestTransaction(householdA.id, accountA.id, {
        description: `Grocery store purchase ${i}`,
        searchText: `grocery store purchase ${i}`,
      }),
    );
    await Promise.all(inserts);

    const results = await searchTransactions(householdA.id, "grocery");

    // Results must be bounded — not all 150 returned
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(100);
  });

  it("search without query returns a smaller bounded set", async () => {
    const { householdA, accountA } = await createTwoHouseholds();

    const inserts = Array.from({ length: 30 }, (_, i) =>
      createTestTransaction(householdA.id, accountA.id, {
        description: `Purchase ${i}`,
        searchText: `purchase ${i}`,
      }),
    );
    await Promise.all(inserts);

    const results = await searchTransactions(householdA.id, "");

    // Empty query uses a tighter limit
    expect(results.length).toBeLessThanOrEqual(20);
  });

  it("household scoping prevents cross-household data leak at volume", async () => {
    const { householdA, accountA, householdB, accountB } = await createTwoHouseholds();

    // Seed into both households
    const insertsA = Array.from({ length: 20 }, (_, i) =>
      createTestTransaction(householdA.id, accountA.id, {
        description: `HouseholdA item ${i}`,
        searchText: `householda item ${i}`,
      }),
    );
    const insertsB = Array.from({ length: 20 }, (_, i) =>
      createTestTransaction(householdB.id, accountB.id, {
        description: `HouseholdA item ${i}`,
        searchText: `householda item ${i}`,
      }),
    );
    await Promise.all([...insertsA, ...insertsB]);

    const resultsA = await searchTransactions(householdA.id, "householda");

    // Only household A's results returned
    expect(resultsA.length).toBe(20);
  });
});
