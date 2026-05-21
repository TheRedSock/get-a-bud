import { describe, expect, it } from "vitest";

import {
  buildExistingTransactionSyncPatch,
  buildProviderTransactionInsertValues,
} from "@/lib/ingestion/enable-banking/transactions";

describe("buildProviderTransactionInsertValues", () => {
  it("includes provider-owned ledger fields for new rows", () => {
    const values = buildProviderTransactionInsertValues({
      householdId: "hh-1",
      financialAccountId: "acct-1",
      transaction: {
        providerTransactionId: "prov-1",
        providerAccountId: "ext-acct-1",
        amountCents: -4200,
        currency: "NOK",
        date: "2026-03-15",
        description: "REMA 1000 OSLO",
        merchantName: "Rema 1000",
      },
      merchantName: "Rema 1000",
      parsed: null,
    });

    expect(values.amountCents).toBe(-4200);
    expect(values.currency).toBe("NOK");
    expect(values.date).toBe("2026-03-15");
    expect(values.accountId).toBe("acct-1");
    expect(values.householdId).toBe("hh-1");
    expect(values.source).toBe("enable_banking");
    expect(values.sourceTransactionId).toBe("prov-1");
    expect(values.merchantName).toBe("Rema 1000");
    expect(values.description).toBe("REMA 1000 OSLO");
  });
});

describe("buildExistingTransactionSyncPatch", () => {
  it("does not include provider-owned ledger fields", () => {
    const patch = buildExistingTransactionSyncPatch({
      existing: {
        id: "tx-1",
        sourceTransactionId: "prov-1",
        description: "Stored description",
        merchantName: "Stored merchant",
        amountCents: -5000,
        currency: "NOK",
        date: "2026-01-10",
        metadata: {},
      },
      transaction: {
        providerTransactionId: "prov-1",
        providerAccountId: "acct-1",
        amountCents: -9999,
        currency: "EUR",
        date: "2026-02-01",
        description: "Provider description",
        merchantName: "Provider merchant",
      },
      merchantName: "Provider merchant",
      parsed: null,
    });

    expect(patch).not.toHaveProperty("amountCents");
    expect(patch).not.toHaveProperty("currency");
    expect(patch).not.toHaveProperty("date");
    expect(patch).not.toHaveProperty("accountId");
    expect(patch).not.toHaveProperty("source");
    expect(patch).not.toHaveProperty("sourceTransactionId");
    expect(patch.description).toBe("Provider description");
  });

  it("preserves user-edited description", () => {
    const patch = buildExistingTransactionSyncPatch({
      existing: {
        id: "tx-1",
        sourceTransactionId: "prov-1",
        description: "User description",
        merchantName: "Merchant",
        amountCents: -5000,
        currency: "NOK",
        date: "2026-01-10",
        metadata: {
          userEdits: { descriptionEdited: true },
        },
      },
      transaction: {
        providerTransactionId: "prov-1",
        providerAccountId: "acct-1",
        amountCents: -5000,
        currency: "NOK",
        date: "2026-01-10",
        description: "Provider description",
      },
      merchantName: null,
      parsed: null,
    });

    expect(patch.description).toBe("User description");
  });

  it("preserves user-edited merchant name", () => {
    const patch = buildExistingTransactionSyncPatch({
      existing: {
        id: "tx-1",
        sourceTransactionId: "prov-1",
        description: "Some description",
        merchantName: "User Merchant",
        amountCents: -5000,
        currency: "NOK",
        date: "2026-01-10",
        metadata: {
          userEdits: { merchantNameEdited: true },
        },
      },
      transaction: {
        providerTransactionId: "prov-1",
        providerAccountId: "acct-1",
        amountCents: -5000,
        currency: "NOK",
        date: "2026-01-10",
        description: "Some description",
        merchantName: "Provider Merchant",
      },
      merchantName: "Provider Merchant",
      parsed: null,
    });

    expect(patch.merchantName).toBe("User Merchant");
  });

  it("contrasts with insert values — patch excludes all provider-owned facts that insert includes", () => {
    const transaction = {
      providerTransactionId: "prov-1",
      providerAccountId: "ext-acct-1",
      amountCents: -4200,
      currency: "NOK",
      date: "2026-03-15",
      description: "REMA 1000 OSLO",
      merchantName: "Rema 1000",
    };

    const insertValues = buildProviderTransactionInsertValues({
      householdId: "hh-1",
      financialAccountId: "acct-1",
      transaction,
      merchantName: "Rema 1000",
      parsed: null,
    });

    const patch = buildExistingTransactionSyncPatch({
      existing: {
        id: "tx-existing",
        sourceTransactionId: "prov-1",
        description: "Old description",
        merchantName: "Old merchant",
        amountCents: -4200,
        currency: "NOK",
        date: "2026-03-15",
        metadata: {},
      },
      transaction,
      merchantName: "Rema 1000",
      parsed: null,
    });

    // Insert includes all provider-owned ledger fields
    expect(insertValues).toHaveProperty("amountCents");
    expect(insertValues).toHaveProperty("currency");
    expect(insertValues).toHaveProperty("date");
    expect(insertValues).toHaveProperty("accountId");
    expect(insertValues).toHaveProperty("source");
    expect(insertValues).toHaveProperty("sourceTransactionId");

    // Patch never includes provider-owned ledger fields
    expect(patch).not.toHaveProperty("amountCents");
    expect(patch).not.toHaveProperty("currency");
    expect(patch).not.toHaveProperty("date");
    expect(patch).not.toHaveProperty("accountId");
    expect(patch).not.toHaveProperty("source");
    expect(patch).not.toHaveProperty("sourceTransactionId");
    expect(patch).not.toHaveProperty("householdId");

    // Both update enrichment fields
    expect(insertValues.merchantName).toBe("Rema 1000");
    expect(patch.merchantName).toBe("Rema 1000");
  });
});
