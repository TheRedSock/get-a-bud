import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import { transactions } from "@/db/schema";
import { buildProviderTransactionInsertValues } from "@/lib/ingestion/enable-banking/transactions";
import { createTestAccount, createTwoHouseholds } from "@/test/factories";
import {
  closeIntegrationDb,
  isDatabaseAvailable,
  resetDatabase,
} from "@/test/integration-db";

const dbAvailable = await isDatabaseAvailable();

describe.skipIf(!dbAvailable)("Enable Banking transaction persistence", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closeIntegrationDb();
  });

  it("deduplicates on source, sourceTransactionId, and account", async () => {
    const { householdA, accountA } = await createTwoHouseholds();

    const values = buildProviderTransactionInsertValues({
      householdId: householdA.id,
      financialAccountId: accountA.id,
      transaction: {
        providerTransactionId: "provider-tx-99",
        providerAccountId: "ext-1",
        amountCents: -2500,
        currency: "NOK",
        date: "2025-05-10",
        description: "Coffee",
        merchantName: "Cafe",
      },
      merchantName: "Cafe",
      parsed: null,
    });

    await db.insert(transactions).values(values);

    const duplicate = await db
      .insert(transactions)
      .values(values)
      .onConflictDoNothing()
      .returning();

    expect(duplicate).toHaveLength(0);

    const rows = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.source, "enable_banking"),
          eq(transactions.sourceTransactionId, "provider-tx-99"),
          eq(transactions.accountId, accountA.id),
        ),
      );

    expect(rows).toHaveLength(1);
  });
});
