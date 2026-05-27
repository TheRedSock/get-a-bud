import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import { recurringBillHistory, recurringBills } from "@/db/schema";
import { suggestCategoriesForHouseholdBills } from "@/lib/finance/bills/suggest-categories";
import {
  createTestBill,
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

describe.skipIf(!dbAvailable)("suggestCategoriesForHouseholdBills", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closeIntegrationDb();
  });

  it("suggests category for auto-ended unapproved bill with linked transactions", async () => {
    const { householdA, accountA } = await createTwoHouseholds();
    const category = await createTestCategory(householdA.id, {
      name: "Subscriptions",
    });

    const bill = await createTestBill(householdA.id, {
      name: "Music League",
      merchantPattern: "musicleague com",
      categoryId: null,
      isActive: false,
      autoEndedAt: new Date("2026-05-26"),
    });

    const txn = await createTestTransaction(householdA.id, accountA.id, {
      categoryId: category.id,
      categorySource: "merchant",
      date: "2026-03-30",
    });

    await db.insert(recurringBillHistory).values({
      billId: bill.id,
      amountCents: 200,
      date: "2026-03-30",
      transactionId: txn.id,
    });

    const result = await suggestCategoriesForHouseholdBills(householdA.id);
    expect(result.updated).toBe(1);

    const [updated] = await db
      .select({ suggestedCategoryId: recurringBills.suggestedCategoryId })
      .from(recurringBills)
      .where(eq(recurringBills.id, bill.id));

    expect(updated?.suggestedCategoryId).toBe(category.id);
  });

  it("skips bills the user ended", async () => {
    const { householdA } = await createTwoHouseholds();

    await createTestBill(householdA.id, {
      categoryId: null,
      isActive: false,
      userEndedAt: new Date("2026-01-01"),
    });

    const result = await suggestCategoriesForHouseholdBills(householdA.id);
    expect(result.updated).toBe(0);
  });
});
