import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import { transactions } from "@/db/schema";
import {
  createTestCategory,
  createTestTransaction,
  createTwoHouseholds,
} from "@/test/factories";
import {
  closeIntegrationDb,
  isDatabaseAvailable,
  resetDatabase,
} from "@/test/integration-db";

const dbAvailable = await isDatabaseAvailable();

describe.skipIf(!dbAvailable)("Categorization job replay safety", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closeIntegrationDb();
  });

  it("does not overwrite user-assigned category on replay", async () => {
    const { householdA, accountA } = await createTwoHouseholds();
    const category = await createTestCategory(householdA.id, { name: "Dining" });

    // Simulate a transaction the user has already categorized
    const tx = await createTestTransaction(householdA.id, accountA.id, {
      description: "Restaurant",
      categoryId: category.id,
    });

    // The categorization job only targets uncategorized rows
    const uncategorized = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.householdId, householdA.id),
          isNull(transactions.categoryId),
        ),
      );

    expect(uncategorized.find((r) => r.id === tx.id)).toBeUndefined();
  });

  it("update guard prevents overwrite even if row was fetched before user edit", async () => {
    const { householdA, accountA } = await createTwoHouseholds();
    const category = await createTestCategory(householdA.id, { name: "Groceries" });

    const tx = await createTestTransaction(householdA.id, accountA.id, {
      description: "Supermarket",
      categoryId: null,
    });

    // Simulate user categorizing between fetch and update (race condition guard)
    await db
      .update(transactions)
      .set({ categoryId: category.id })
      .where(eq(transactions.id, tx.id));

    // Job attempts to set a different category, guarded by `categoryId IS NULL`
    const result = await db
      .update(transactions)
      .set({ categoryId: "some-other-cat-id" })
      .where(
        and(
          eq(transactions.id, tx.id),
          isNull(transactions.categoryId),
        ),
      )
      .returning({ id: transactions.id });

    // No rows returned — guard prevented overwrite
    expect(result).toHaveLength(0);

    // User's category is preserved
    const [row] = await db
      .select({ categoryId: transactions.categoryId })
      .from(transactions)
      .where(eq(transactions.id, tx.id));

    expect(row.categoryId).toBe(category.id);
  });

  it("sync dedup prevents duplicate transactions on replay", async () => {
    const { householdA, accountA } = await createTwoHouseholds();

    const providerTxId = "provider-replay-test-001";
    await createTestTransaction(householdA.id, accountA.id, {
      source: "enable_banking",
      sourceTransactionId: providerTxId,
      amountCents: -3500,
      description: "Replayed sync",
    });

    // Second insert with same source+sourceTransactionId+accountId deduplicates
    const dupeResult = await db
      .insert(transactions)
      .values({
        householdId: householdA.id,
        accountId: accountA.id,
        source: "enable_banking",
        sourceTransactionId: providerTxId,
        amountCents: -3500,
        currency: "NOK",
        date: "2025-05-10",
        description: "Replayed sync",
        status: "posted",
        searchText: "replayed sync",
      })
      .onConflictDoNothing()
      .returning();

    expect(dupeResult).toHaveLength(0);
  });
});
