import { describe, expect, it, vi } from "vitest";

import { EVENT_NAMES } from "@/inngest/lib/events";
import { EVENT_SCHEMAS, sendValidatedStepEvent } from "@/inngest/lib/send-event";

describe("sendInngestEvent schemas", () => {
  it("rejects invalid payloads before enqueueing", () => {
    expect(() =>
      EVENT_SCHEMAS[EVENT_NAMES.categorizeTransactions].parse({}),
    ).toThrow();
  });

  it("accepts backfill payloads scoped to a household", () => {
    const data = EVENT_SCHEMAS[EVENT_NAMES.backfillParsedFields].parse({
      householdId: "hh-1",
      afterId: "tx-1",
    });

    expect(data).toEqual({ householdId: "hh-1", afterId: "tx-1" });
  });

  it("accepts well-formed bank sync payloads", () => {
    const data = EVENT_SCHEMAS[EVENT_NAMES.bankConnectionSync].parse({
      connectionId: "conn-1",
      runId: "run-1",
    });

    expect(data).toEqual({ connectionId: "conn-1", runId: "run-1" });
  });
});

describe("sendValidatedStepEvent", () => {
  it("validates data before calling step.sendEvent", async () => {
    const sendEvent = vi.fn().mockResolvedValue(undefined);
    const step = { sendEvent };

    await sendValidatedStepEvent(step, "continue", EVENT_NAMES.linkTransferPairs, {
      householdId: "hh-1",
    });

    expect(sendEvent).toHaveBeenCalledWith("continue", {
      name: EVENT_NAMES.linkTransferPairs,
      data: { householdId: "hh-1" },
    });
  });

  it("rejects invalid continuation payloads", async () => {
    const step = { sendEvent: vi.fn() };

    await expect(
      sendValidatedStepEvent(step, "continue", EVENT_NAMES.linkTransferPairs, {
        householdId: "",
      }),
    ).rejects.toThrow();
  });
});
