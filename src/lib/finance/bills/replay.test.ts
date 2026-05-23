import { describe, expect, it } from "vitest";

import { shouldClearUnapprovedForReplayStart } from "@/lib/finance/bills/replay";

describe("shouldClearUnapprovedForReplayStart", () => {
  it("returns true only on manual replay without continuation offsets", () => {
    expect(
      shouldClearUnapprovedForReplayStart({ replayUnapproved: true }),
    ).toBe(true);
  });

  it("returns false when replayUnapproved is false or omitted", () => {
    expect(
      shouldClearUnapprovedForReplayStart({ replayUnapproved: false }),
    ).toBe(false);
    expect(shouldClearUnapprovedForReplayStart({})).toBe(false);
  });

  it("returns false on Phase B continuation", () => {
    expect(
      shouldClearUnapprovedForReplayStart({
        replayUnapproved: true,
        expenseOffset: 500,
      }),
    ).toBe(false);
  });

  it("returns false on match continuation", () => {
    expect(
      shouldClearUnapprovedForReplayStart({
        replayUnapproved: true,
        matchExpenseOffset: 500,
      }),
    ).toBe(false);
  });
});
