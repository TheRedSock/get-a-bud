import "@/test/integration-mocks";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  deleteTransaction,
  updateTransaction,
} from "@/app/(app)/transactions/actions";
import {
  createTestTransaction,
  createTwoHouseholds,
} from "@/test/factories";
import {
  closeIntegrationDb,
  isDatabaseAvailable,
  resetDatabase,
} from "@/test/integration-db";
import { resetIntegrationState, setIntegrationSession } from "@/test/integration-mocks";

const dbAvailable = await isDatabaseAvailable();

describe.skipIf(!dbAvailable)("Transaction actions — integration", () => {
  beforeAll(async () => {
    if (!dbAvailable) return;
    await resetDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
    resetIntegrationState();
  });

  afterAll(async () => {
    await closeIntegrationDb();
  });

  it("rejects update for a transaction in another household", async () => {
    const { userA, householdA, accountB, householdB } = await createTwoHouseholds();
    const txInB = await createTestTransaction(householdB.id, accountB.id, {
      description: "Other household tx",
    });

    setIntegrationSession({ id: userA.id, name: userA.name, email: userA.email });

    const result = await updateTransaction({
      transactionId: txInB.id,
      data: { description: "Hacked" },
    });

    expect(result.error).toBeDefined();
    expect(result.error?.code).toBe("not_found");
    expect(result.data).toBeUndefined();

    void householdA;
  });

  it("rejects amount edit on enable_banking sourced transaction", async () => {
    const { userA, householdA, accountA } = await createTwoHouseholds();
    const syncedTx = await createTestTransaction(householdA.id, accountA.id, {
      source: "enable_banking",
      sourceTransactionId: "eb-tx-1",
      amountCents: -4200,
      date: "2025-04-15",
    });

    setIntegrationSession({ id: userA.id, name: userA.name, email: userA.email });

    const result = await updateTransaction({
      transactionId: syncedTx.id,
      data: { amountCents: "-99.99" },
    });

    expect(result.error).toBeDefined();
    expect(result.error?.code).toBe("validation_failed");
    expect(result.error?.message).toContain("bank");
  });

  it("rejects delete for a transaction in another household", async () => {
    const { userA, accountB, householdB } = await createTwoHouseholds();
    const txInB = await createTestTransaction(householdB.id, accountB.id);

    setIntegrationSession({ id: userA.id, name: userA.name, email: userA.email });

    const result = await deleteTransaction({ transactionId: txInB.id });

    expect(result.error).toBeDefined();
    expect(result.error?.code).toBe("not_found");
  });

  it("allows description update on synced transaction", async () => {
    const { userA, householdA, accountA } = await createTwoHouseholds();
    const syncedTx = await createTestTransaction(householdA.id, accountA.id, {
      source: "enable_banking",
      sourceTransactionId: "eb-tx-2",
      description: "Original",
    });

    setIntegrationSession({ id: userA.id, name: userA.name, email: userA.email });

    const result = await updateTransaction({
      transactionId: syncedTx.id,
      data: { description: "User label" },
    });

    expect(result.error).toBeUndefined();
    expect(result.data?.transaction.description).toBe("User label");
  });
});
