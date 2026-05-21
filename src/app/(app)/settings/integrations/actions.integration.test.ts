import "@/test/integration-mocks";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { queueEnableBankingSync } from "@/app/(app)/settings/integrations/actions";
import { createTestConnection, createTwoHouseholds } from "@/test/factories";
import {
  closeIntegrationDb,
  isDatabaseAvailable,
  resetDatabase,
} from "@/test/integration-db";
import {
  grantStepUp,
  resetIntegrationState,
  setIntegrationSession,
} from "@/test/integration-mocks";

const dbAvailable = await isDatabaseAvailable();

describe.skipIf(!dbAvailable)("Integration actions — household scoping", () => {
  beforeEach(async () => {
    await resetDatabase();
    resetIntegrationState();
  });

  afterAll(async () => {
    await closeIntegrationDb();
  });

  it("rejects queue sync for connection in another household", async () => {
    const { userA, householdB } = await createTwoHouseholds();
    const connectionB = await createTestConnection(householdB.id);

    setIntegrationSession({ id: userA.id, email: userA.email, name: userA.name });
    await grantStepUp(userA.id);

    const result = await queueEnableBankingSync({ connectionId: connectionB.id });

    expect(result.error?.code).toBe("not_found");
  });
});
