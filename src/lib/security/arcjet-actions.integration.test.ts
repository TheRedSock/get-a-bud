import "@/test/integration-mocks";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createTransaction } from "@/app/(app)/transactions/actions";
import { rateLimitedError } from "@/lib/errors/catalog";
import { enforceActionRateLimit } from "@/lib/security/arcjet";
import { createTwoHouseholds } from "@/test/factories";
import {
  closeIntegrationDb,
  isDatabaseAvailable,
  resetDatabase,
} from "@/test/integration-db";
import { setIntegrationSession } from "@/test/integration-mocks";

const dbAvailable = await isDatabaseAvailable();

describe.skipIf(!dbAvailable)("Arcjet enforcement on createTransaction", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closeIntegrationDb();
  });

  it("returns rate_limited when Arcjet denies the mutation", async () => {
    const { userA, accountA } = await createTwoHouseholds();
    setIntegrationSession({
      id: userA.id,
      email: userA.email,
      name: userA.name,
    });

    vi.mocked(enforceActionRateLimit).mockRejectedValueOnce(
      rateLimitedError("Too many requests. Please wait and try again."),
    );

    const result = await createTransaction({
      accountId: accountA.id,
      amountCents: "25.00",
      date: "2025-05-02",
      description: "Blocked",
    });

    expect(result.error?.code).toBe("rate_limited");
    expect(result.data).toBeUndefined();
  });
});
