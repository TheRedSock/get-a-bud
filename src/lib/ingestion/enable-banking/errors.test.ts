import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("handleEnableBankingRateLimit", () => {
  it("returns rateLimitedUntil and preserves progress in the sync result", () => {
    const source = readFileSync(
      "src/lib/ingestion/enable-banking/errors.ts",
      "utf8",
    );

    expect(source).toContain("rateLimitedUntil: retryAt");
    expect(source).toContain("6 * 60 * 60 * 1000");
    expect(source).toContain("progress: input.progress");
    expect(source).toContain("accounts: []");
    expect(source).toContain("transactions: []");
  });
});
