import "@/test/integration-mocks";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createTransaction } from "@/app/(app)/transactions/actions";
import { createTwoHouseholds } from "@/test/factories";
import {
  closeIntegrationDb,
  isDatabaseAvailable,
  resetDatabase,
} from "@/test/integration-db";
import { resetIntegrationState } from "@/test/integration-mocks";

const dbAvailable = await isDatabaseAvailable();

describe.skipIf(!dbAvailable)("Transaction actions — unauthenticated", () => {
  beforeEach(async () => {
    await resetDatabase();
    resetIntegrationState();
    // Session deliberately not set — simulates unauthenticated request
  });

  afterAll(async () => {
    await closeIntegrationDb();
  });

  it("returns unauthorized without leaking data", async () => {
    const { accountA } = await createTwoHouseholds();

    const result = await createTransaction({
      accountId: accountA.id,
      amountCents: "10.00", // Form-style input; moneyPreprocessor converts to 1000 cents
      date: "2025-05-01",
      description: "Should fail",
    });

    expect(result.error?.code).toBe("authentication_required");
    expect(result.data).toBeUndefined();
  });
});
