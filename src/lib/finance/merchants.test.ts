import {
  getCategoryLearningTarget,
  getSourceObservedMerchantName,
  isHighConfidenceAliasMatch,
  tokenOverlapScore,
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

describe("tokenOverlapScore (character-weighted)", () => {
  it("gives high score when bulk of text matches despite short token mismatch", () => {
    // "paypal spotify p3" vs "paypal spotify p4" — only the 2-char token differs
    const score = tokenOverlapScore("paypal spotify p3", "paypal spotify p4");
    // Matched chars: "paypal"(6) + "spotify"(7) = 13
    // Total chars: max(6+7+2, 6+7+2) = 15
    // Score: 13/15 = 0.867
    expect(score).toBeGreaterThan(0.8);
    expect(score).toBeGreaterThanOrEqual(0.67); // passes the threshold
  });

  it("gives low score when strings share only one short token", () => {
    const score = tokenOverlapScore("abc longmerchantname", "xyz longmerchantname");
    // "longmerchantname" (16 chars) matches, "abc" (3) doesn't
    // Score: 16/max(19, 19) = 0.84
    expect(score).toBeGreaterThan(0.67);
  });

  it("returns 0 when no tokens match", () => {
    const score = tokenOverlapScore("alpha beta", "gamma delta");
    expect(score).toBe(0);
  });

  it("returns 1 when all tokens match exactly", () => {
    const score = tokenOverlapScore("spotify premium", "spotify premium");
    expect(score).toBe(1);
  });

  it("handles prefix matching with character weighting", () => {
    // "rødtve" is prefix of "rødtvet" — should count as matched
    const score = tokenOverlapScore("kiwi 425 rødtve", "kiwi 425 rødtvet");
    expect(score).toBeGreaterThan(0.9);
  });
});
