import { describe, expect, it } from "vitest";

import {
  canUndoAutoLabel,
  getClassificationUiState,
} from "@/lib/classification/ui-state";

describe("getClassificationUiState", () => {
  it("does not show an indicator for user-confirmed labels", () => {
    expect(
      getClassificationUiState({
        categoryId: "cat_1",
        categorySource: "user",
      }),
    ).toBe("user_confirmed");
  });

  it.each(["merchant", "rule", "model"] as const)(
    "shows auto-applied state for %s labels",
    (categorySource) => {
      expect(
        getClassificationUiState({
          categoryId: "cat_1",
          categorySource,
          categoryConfidence: "0.80",
        }),
      ).toBe("auto_applied");
    },
  );

  it("shows suggestion state when a category is suggested but not applied", () => {
    expect(
      getClassificationUiState({
        categoryId: null,
        categorySource: null,
        suggestedCategoryId: "cat_2",
      }),
    ).toBe("suggestion");
  });

  it("shows needs-review state for uncategorized transactions without suggestions", () => {
    expect(
      getClassificationUiState({
        categoryId: null,
        categorySource: null,
        suggestedCategoryId: null,
      }),
    ).toBe("needs_review");
  });

  it("lets a user-confirmed category win over stale suggestion data", () => {
    expect(
      getClassificationUiState({
        categoryId: "cat_1",
        categorySource: "user",
        suggestedCategoryId: "cat_2",
      }),
    ).toBe("user_confirmed");
  });
});

describe("canUndoAutoLabel", () => {
  it("allows undo only for active auto-label metadata", () => {
    expect(
      canUndoAutoLabel({
        metadata: { autoLabel: { undone: false } },
      }),
    ).toBe(true);
    expect(
      canUndoAutoLabel({
        metadata: { autoLabel: { undone: true } },
      }),
    ).toBe(false);
    expect(canUndoAutoLabel({ metadata: {} })).toBe(false);
  });
});
