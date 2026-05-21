import { NonRetriableError } from "inngest";
import { describe, expect, it, vi } from "vitest";

import { syncBankConnection } from "@/inngest/functions/sync-bank-connection";
import {
  bankConnectionSyncSchema,
  parseJobEvent,
} from "@/inngest/lib/event-validation";
import { EVENT_NAMES } from "@/inngest/lib/events";

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn() },
}));

describe("syncBankConnection", () => {
  it("is registered with a stable function id for replay", () => {
    expect(syncBankConnection.id()).toBe("sync-bank-connection");
  });

  it("rejects events missing connectionId", () => {
    expect(() =>
      parseJobEvent(bankConnectionSyncSchema, {}, {
        eventName: EVENT_NAMES.bankConnectionSync,
      }),
    ).toThrow(NonRetriableError);
  });

  it("rejects events with empty connectionId", () => {
    expect(() =>
      parseJobEvent(bankConnectionSyncSchema, { connectionId: "" }, {
        eventName: EVENT_NAMES.bankConnectionSync,
      }),
    ).toThrow(NonRetriableError);
  });

  it("accepts valid event with optional runId", () => {
    const data = parseJobEvent(
      bankConnectionSyncSchema,
      { connectionId: "conn-1" },
      { eventName: EVENT_NAMES.bankConnectionSync },
    );

    expect(data).toEqual({ connectionId: "conn-1" });
  });

  it("accepts valid event with explicit runId", () => {
    const data = parseJobEvent(
      bankConnectionSyncSchema,
      { connectionId: "conn-1", runId: "run-1" },
      { eventName: EVENT_NAMES.bankConnectionSync },
    );

    expect(data).toEqual({ connectionId: "conn-1", runId: "run-1" });
  });
});
