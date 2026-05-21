import { NonRetriableError } from "inngest";
import { describe, expect, it, vi } from "vitest";

import { linkTransferPairs } from "@/inngest/functions/link-transfer-pairs";
import {
  linkTransferPairsSchema,
  parseJobEvent,
} from "@/inngest/lib/event-validation";
import { EVENT_NAMES } from "@/inngest/lib/events";

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn() },
}));

describe("linkTransferPairs", () => {
  it("is registered with a stable function id for replay", () => {
    expect(linkTransferPairs.id()).toBe("link-transfer-pairs");
  });

  it("rejects events missing householdId", () => {
    expect(() =>
      parseJobEvent(linkTransferPairsSchema, {}, {
        eventName: EVENT_NAMES.linkTransferPairs,
      }),
    ).toThrow(NonRetriableError);
  });

  it("rejects events with empty householdId", () => {
    expect(() =>
      parseJobEvent(linkTransferPairsSchema, { householdId: "" }, {
        eventName: EVENT_NAMES.linkTransferPairs,
      }),
    ).toThrow(NonRetriableError);
  });

  it("accepts valid event with householdId only", () => {
    const data = parseJobEvent(
      linkTransferPairsSchema,
      { householdId: "hh-1" },
      { eventName: EVENT_NAMES.linkTransferPairs },
    );

    expect(data).toEqual({ householdId: "hh-1" });
  });

  it("accepts valid event with optional afterId cursor", () => {
    const data = parseJobEvent(
      linkTransferPairsSchema,
      { householdId: "hh-1", afterId: "tx-100" },
      { eventName: EVENT_NAMES.linkTransferPairs },
    );

    expect(data).toEqual({ householdId: "hh-1", afterId: "tx-100" });
  });
});
