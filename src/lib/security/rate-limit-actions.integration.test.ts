import "@/test/integration-mocks";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createTransaction } from "@/app/(app)/transactions/actions";
import { rateLimitedError } from "@/lib/errors/catalog";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { createTwoHouseholds } from "@/test/factories";
import {
  closeIntegrationDb,
  isDatabaseAvailable,
  resetDatabase,
} from "@/test/integration-db";
import { setIntegrationSession } from "@/test/integration-mocks";

const dbAvailable = await isDatabaseAvailable();

describe.skipIf(!dbAvailable)("Rate limit enforcement on createTransaction", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closeIntegrationDb();
  });

  it("returns rate_limited when the limiter denies the mutation", async () => {
    const { userA, accountA } = await createTwoHouseholds();
    setIntegrationSession({
      id: userA.id,
      email: userA.email,
      name: userA.name,
    });

    vi.mocked(enforceRateLimit).mockRejectedValueOnce(
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
