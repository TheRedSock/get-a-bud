import { describe, expect, it } from "vitest";

import { billNeedsApproval } from "./approval";

describe("billNeedsApproval", () => {
  it("returns true for active detected bill without category", () => {
    expect(
      billNeedsApproval({
        categoryId: null,
        userEndedAt: null,
      }),
    ).toBe(true);
  });

  it("returns true for auto-ended bill without category", () => {
    expect(
      billNeedsApproval({
        categoryId: null,
        userEndedAt: null,
      }),
    ).toBe(true);
  });

  it("returns false when category is assigned", () => {
    expect(
      billNeedsApproval({
        categoryId: "cat-1",
        userEndedAt: null,
      }),
    ).toBe(false);
  });

  it("returns false when user explicitly ended without approving", () => {
    expect(
      billNeedsApproval({
        categoryId: null,
        userEndedAt: new Date("2026-01-01"),
      }),
    ).toBe(false);
  });
});
