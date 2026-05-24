import { describe, expect, it } from "vitest";

import { inferSuggestedCategoryFromMatches } from "./categorization";

describe("inferSuggestedCategoryFromMatches", () => {
  it("returns shared auto category", () => {
    expect(
      inferSuggestedCategoryFromMatches([
        { categoryId: "cat-1", categorySource: "merchant" },
        { categoryId: "cat-1", categorySource: "rule" },
      ]),
    ).toBe("cat-1");
  });

  it("returns null when categories differ", () => {
    expect(
      inferSuggestedCategoryFromMatches([
        { categoryId: "cat-1", categorySource: "merchant" },
        { categoryId: "cat-2", categorySource: "merchant" },
      ]),
    ).toBeNull();
  });

  it("returns null when any txn is user-labeled", () => {
    expect(
      inferSuggestedCategoryFromMatches([
        { categoryId: "cat-1", categorySource: "user" },
      ]),
    ).toBeNull();
  });
});
