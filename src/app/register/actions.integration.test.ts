import "@/test/integration-mocks";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { registerUser } from "@/app/register/actions";
import { db } from "@/db";
import { households, memberships, users } from "@/db/schema";
import { createTestUser } from "@/test/factories";
import {
  closeIntegrationDb,
  isDatabaseAvailable,
  resetDatabase,
} from "@/test/integration-db";

const dbAvailable = await isDatabaseAvailable();

describe.skipIf(!dbAvailable)("registerUser — integration", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closeIntegrationDb();
  });

  it("provisions a user and household", async () => {
    const result = await registerUser({
      name: "New User",
      email: "new-user@integration.test",
      password: "password12345",
      currency: "NOK",
    });

    expect(result.error).toBeUndefined();
    expect(result.data?.ok).toBe(true);

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, "new-user@integration.test"));

    expect(user).toBeDefined();

    const [membership] = await db
      .select()
      .from(memberships)
      .where(eq(memberships.userId, user!.id));

    expect(membership).toBeDefined();

    const [household] = await db
      .select()
      .from(households)
      .where(eq(households.id, membership!.householdId));

    expect(household?.defaultCurrency).toBe("NOK");
  });

  it("returns a safe conflict error for duplicate email", async () => {
    await createTestUser({ email: "dup@integration.test" });

    const result = await registerUser({
      name: "Another",
      email: "dup@integration.test",
      password: "password12345",
      currency: "NOK",
    });

    expect(result.error?.code).toBe("conflict");
    expect(result.error?.message).toContain("already exists");
  });
});
