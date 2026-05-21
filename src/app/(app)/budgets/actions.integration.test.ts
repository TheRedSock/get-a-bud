import "@/test/integration-mocks";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { deleteBudget, updateBudget } from "@/app/(app)/budgets/actions";
import { createTestBudget, createTwoHouseholds } from "@/test/factories";
import {
  closeIntegrationDb,
  isDatabaseAvailable,
  resetDatabase,
} from "@/test/integration-db";
import { resetIntegrationState, setIntegrationSession } from "@/test/integration-mocks";

const dbAvailable = await isDatabaseAvailable();

describe.skipIf(!dbAvailable)("Budget actions — integration", () => {
  beforeEach(async () => {
    await resetDatabase();
    resetIntegrationState();
  });

  afterAll(async () => {
    await closeIntegrationDb();
  });

  it("rejects update for budget in another household", async () => {
    const { userA, householdB } = await createTwoHouseholds();
    const budgetB = await createTestBudget(householdB.id, { name: "Other budget" });

    setIntegrationSession({ id: userA.id, email: userA.email, name: userA.name });

    const result = await updateBudget({
      budgetId: budgetB.id,
      data: { name: "Hacked" },
    });

    expect(result.error?.code).toBe("not_found");
  });

  it("rejects delete for budget in another household", async () => {
    const { userA, householdB } = await createTwoHouseholds();
    const budgetB = await createTestBudget(householdB.id);

    setIntegrationSession({ id: userA.id, email: userA.email, name: userA.name });

    const result = await deleteBudget({ budgetId: budgetB.id });

    expect(result.error?.code).toBe("not_found");
  });
});
