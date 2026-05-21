import "@/test/integration-mocks";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { deleteAccount, updateAccount } from "@/app/(app)/accounts/actions";
import { createTestAccount, createTwoHouseholds } from "@/test/factories";
import {
  closeIntegrationDb,
  isDatabaseAvailable,
  resetDatabase,
} from "@/test/integration-db";
import {
  clearStepUp,
  grantStepUp,
  resetIntegrationState,
  setIntegrationSession,
} from "@/test/integration-mocks";

const dbAvailable = await isDatabaseAvailable();

describe.skipIf(!dbAvailable)("Account actions — integration", () => {
  beforeEach(async () => {
    await resetDatabase();
    resetIntegrationState();
  });

  afterAll(async () => {
    await closeIntegrationDb();
  });

  it("rejects update for account in another household", async () => {
    const { userA, accountB } = await createTwoHouseholds();

    setIntegrationSession({ id: userA.id, email: userA.email, name: userA.name });

    const result = await updateAccount({
      accountId: accountB.id,
      data: { name: "Stolen" },
    });

    expect(result.error?.code).toBe("not_found");
  });

  it("requires step-up before deleting a manual account", async () => {
    const { userA, householdA } = await createTwoHouseholds();
    const manual = await createTestAccount(householdA.id, { name: "Manual", isManual: true });

    setIntegrationSession({ id: userA.id, email: userA.email, name: userA.name });
    clearStepUp();

    const result = await deleteAccount({ accountId: manual.id });

    expect(result.error?.code).toBe("step_up_required");
  });

  it("rejects deletion of provider-synced account after step-up", async () => {
    const { userA, householdA } = await createTwoHouseholds();
    const synced = await createTestAccount(householdA.id, {
      name: "Bank",
      isManual: false,
    });

    setIntegrationSession({ id: userA.id, email: userA.email, name: userA.name });
    await grantStepUp(userA.id);

    const result = await deleteAccount({ accountId: synced.id });

    expect(result.error).toBeDefined();
    expect(result.error?.message).toMatch(/sync|provider|manual/i);
  });
});
