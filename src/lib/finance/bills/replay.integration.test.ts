import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import { recurringBills } from "@/db/schema";
import { clearUnapprovedBillsForReplay } from "@/lib/finance/bills/replay";
import {
  createTestBill,
  createTestCategory,
  createTwoHouseholds,
} from "@/test/factories";
import {
  closeIntegrationDb,
  isDatabaseAvailable,
  resetDatabase,
} from "@/test/integration-db";

const dbAvailable = await isDatabaseAvailable();

describe.skipIf(!dbAvailable)("clearUnapprovedBillsForReplay", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closeIntegrationDb();
  });

  it("removes only unapproved bills without userEndedAt", async () => {
    const { householdA } = await createTwoHouseholds();
    const category = await createTestCategory(householdA.id, { name: "Utilities" });

    const pending = await createTestBill(householdA.id, {
      name: "Pending bill",
      merchantPattern: "foodora norway",
      categoryId: null,
    });
    const approved = await createTestBill(householdA.id, {
      name: "Approved bill",
      merchantPattern: "netflix com",
      categoryId: category.id,
    });
    const userEnded = await createTestBill(householdA.id, {
      name: "User ended",
      merchantPattern: "old gym",
      categoryId: null,
      isActive: false,
      userEndedAt: new Date("2024-01-01"),
    });

    const result = await clearUnapprovedBillsForReplay(householdA.id);

    expect(result.removed).toBe(1);

    const remaining = await db
      .select({ id: recurringBills.id })
      .from(recurringBills)
      .where(eq(recurringBills.householdId, householdA.id));

    expect(remaining.map((r) => r.id).sort()).toEqual(
      [approved.id, userEnded.id].sort(),
    );
    expect(remaining.find((r) => r.id === pending.id)).toBeUndefined();
  });

  it("does not affect another household", async () => {
    const { householdA, householdB } = await createTwoHouseholds();

    await createTestBill(householdA.id, { categoryId: null });
    const billB = await createTestBill(householdB.id, { categoryId: null });

    await clearUnapprovedBillsForReplay(householdA.id);

    const bRows = await db
      .select({ id: recurringBills.id })
      .from(recurringBills)
      .where(eq(recurringBills.householdId, householdB.id));

    expect(bRows).toHaveLength(1);
    expect(bRows[0].id).toBe(billB.id);
  });
});
