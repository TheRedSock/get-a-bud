import {
  getCategoryLearningTarget,
  getSourceObservedMerchantName,
  isHighConfidenceAliasMatch,
} from "@/lib/finance/merchants";

describe("merchant source-observed alias selection", () => {
  it("prefers the original merchant over the user-edited display name", () => {
    const transaction = {
      description: "Kiwi",
      merchantName: "Kiwi",
      normalizedMerchantName: "kiwi",
      metadata: {
        userEdits: { originalMerchantName: "Kiwi 425 Rødtvet" },
      },
    };

    expect(getSourceObservedMerchantName(transaction)).toBe("Kiwi 425 Rødtvet");
    expect(getCategoryLearningTarget(transaction)).toEqual({
      matcher: "Kiwi 425 Rødtvet",
      matchField: "merchant",
    });
  });

  it("uses import observed merchant metadata before display fields", () => {
    const transaction = {
      description: "Kiwi",
      merchantName: "Kiwi Rødtvet",
      normalizedMerchantName: "kiwi rødtvet",
      metadata: {
        observedMerchantName: "KIWI 425 RØDTVE",
      },
    };

    expect(getSourceObservedMerchantName(transaction)).toBe("KIWI 425 RØDTVE");
  });
});

describe("merchant fuzzy alias confidence", () => {
  it("accepts a truncated same-store card statement alias", () => {
    expect(
      isHighConfidenceAliasMatch({
        normalizedObserved: "kiwi 425 rødtve",
        normalizedAlias: "kiwi 425 rødtvet",
        similarity: 0.9,
      }),
    ).toBe(true);
  });

  it("rejects unrelated short aliases even with some text similarity", () => {
    expect(
      isHighConfidenceAliasMatch({
        normalizedObserved: "kiwi",
        normalizedAlias: "kiwi 425 rødtvet",
        similarity: 0.7,
      }),
    ).toBe(false);
  });
});
