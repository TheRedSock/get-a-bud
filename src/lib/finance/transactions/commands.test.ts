import {
  buildSuggestionApprovalValues,
  buildUndoAutoLabelValues,
} from "./commands";

describe("transaction commands", () => {
  describe("buildSuggestionApprovalValues", () => {
    it("uses suggested values when available", () => {
      const result = buildSuggestionApprovalValues({
        suggestedDescription: "Netflix Subscription",
        suggestedMerchantName: "Netflix",
        suggestedCategoryId: "cat-123",
        description: "NFLX*MEMBERSHIP",
        merchantName: null,
      });

      expect(result.categoryId).toBe("cat-123");
      expect(result.description).toBe("Netflix Subscription");
      expect(result.merchantName).toBe("Netflix");
      expect(result.categorySource).toBe("user");
      expect(result.categoryConfidence).toBe("1.00");
      expect(result.suggestedCategoryId).toBeNull();
      expect(result.suggestedDescription).toBeNull();
      expect(result.suggestedMerchantName).toBeNull();
    });

    it("falls back to original values when suggestions are null", () => {
      const result = buildSuggestionApprovalValues({
        suggestedDescription: null,
        suggestedMerchantName: null,
        suggestedCategoryId: "cat-456",
        description: "Original Desc",
        merchantName: "Original Merchant",
      });

      expect(result.description).toBe("Original Desc");
      expect(result.merchantName).toBe("Original Merchant");
      expect(result.categoryId).toBe("cat-456");
    });

    it("builds searchText from description and merchant", () => {
      const result = buildSuggestionApprovalValues({
        suggestedDescription: "Grocery Store",
        suggestedMerchantName: "Rema 1000",
        suggestedCategoryId: "cat-789",
        description: "old",
        merchantName: null,
      });

      expect(result.searchText).toBe("Grocery Store Rema 1000");
    });
  });

  describe("buildUndoAutoLabelValues", () => {
    it("returns null when no auto-label metadata exists", () => {
      expect(buildUndoAutoLabelValues(null)).toBeNull();
      expect(buildUndoAutoLabelValues({})).toBeNull();
      expect(buildUndoAutoLabelValues({ autoLabel: undefined })).toBeNull();
    });

    it("returns null when auto-label is already undone", () => {
      const metadata = {
        autoLabel: {
          originalDescription: "Old Desc",
          originalMerchantName: "Old Merchant",
          undone: true,
          appliedAt: "2024-01-01",
          categoryId: "cat-1",
          method: "rule" as const,
        },
      };

      expect(buildUndoAutoLabelValues(metadata)).toBeNull();
    });

    it("restores original values from auto-label metadata", () => {
      const metadata = {
        autoLabel: {
          originalDescription: "NFLX*MEMBERSHIP FEE",
          originalMerchantName: "NFLX",
          undone: false,
          appliedAt: "2024-01-01",
          categoryId: "cat-1",
          method: "rule" as const,
        },
      };

      const result = buildUndoAutoLabelValues(metadata);
      expect(result).not.toBeNull();

      const { values } = result!;
      expect(values.description).toBe("NFLX*MEMBERSHIP FEE");
      expect(values.merchantName).toBe("NFLX");
      expect(values.categoryId).toBeNull();
      expect(values.categorySource).toBeNull();
      expect(values.categoryConfidence).toBeNull();
      expect(values.suggestedCategoryId).toBeNull();

      // Should mark as undone in metadata
      const newMetadata = values.metadata as Record<string, unknown>;
      const autoLabel = newMetadata.autoLabel as Record<string, unknown>;
      expect(autoLabel.undone).toBe(true);
    });

    it("preserves other metadata when building undo values", () => {
      const metadata = {
        otherKey: "preserved",
        autoLabel: {
          originalDescription: "Test",
          originalMerchantName: null,
          undone: false,
          appliedAt: "2024-01-01",
          categoryId: "cat-1",
          method: "rule" as const,
        },
      };

      const result = buildUndoAutoLabelValues(metadata);
      const newMetadata = result!.values.metadata as Record<string, unknown>;
      expect(newMetadata.otherKey).toBe("preserved");
    });
  });
});
