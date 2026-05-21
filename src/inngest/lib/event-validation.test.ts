import { NonRetriableError } from "inngest";
import { describe, expect, it, vi } from "vitest";

import {
  bankConnectionSyncSchema,
  categorizeTransactionsSchema,
  detectRecurringBillsSchema,
  backfillParsedFieldsSchema,
  linkTransferPairsSchema,
  parseJobEvent,
} from "@/inngest/lib/event-validation";

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn() },
}));

describe("parseJobEvent", () => {
  it("returns parsed data for valid bank sync payloads", () => {
    const data = parseJobEvent(
      bankConnectionSyncSchema,
      { connectionId: "conn-1", runId: "run-1" },
      { eventName: "bank.connection.sync" },
    );

    expect(data).toEqual({ connectionId: "conn-1", runId: "run-1" });
  });

  it("throws NonRetriableError for invalid payloads", () => {
    expect(() =>
      parseJobEvent(
        linkTransferPairsSchema,
        { householdId: "" },
        { eventName: "transactions.link-transfers" },
      ),
    ).toThrow(NonRetriableError);
  });

  it("rejects categorize events without household or connection scope", () => {
    expect(() =>
      parseJobEvent(
        categorizeTransactionsSchema,
        {},
        { eventName: "transactions.categorize" },
      ),
    ).toThrow(NonRetriableError);
  });

  it("accepts categorize events scoped by connectionId", () => {
    const data = parseJobEvent(
      categorizeTransactionsSchema,
      { connectionId: "conn-1" },
      { eventName: "transactions.categorize" },
    );

    expect(data).toEqual({ connectionId: "conn-1" });
  });

  it("requires householdId for backfill events", () => {
    expect(() =>
      parseJobEvent(
        backfillParsedFieldsSchema,
        { afterId: "tx-1" },
        { eventName: "transactions.backfill-parsed-fields" },
      ),
    ).toThrow(NonRetriableError);

    const data = parseJobEvent(
      backfillParsedFieldsSchema,
      { householdId: "hh-1", afterId: "tx-1" },
      { eventName: "transactions.backfill-parsed-fields" },
    );

    expect(data).toEqual({ householdId: "hh-1", afterId: "tx-1" });
  });

  it("accepts recurring detect events with matchExpenseOffset", () => {
    const data = parseJobEvent(
      detectRecurringBillsSchema,
      { householdId: "hh-1", matchExpenseOffset: 500 },
      { eventName: "transactions.recurring.detect" },
    );

    expect(data).toEqual({
      householdId: "hh-1",
      matchExpenseOffset: 500,
    });
  });
});
