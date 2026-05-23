import { describe, expect, it } from "vitest";

import { isPipelineStale } from "@/lib/ingestion/pipeline/types";

describe("isPipelineStale", () => {
  it("marks heartbeat older than 5 minutes as stale", () => {
    const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);
    expect(isPipelineStale(sixMinutesAgo)).toBe(true);
  });

  it("does not mark recent heartbeat as stale", () => {
    expect(isPipelineStale(new Date())).toBe(false);
  });
});
