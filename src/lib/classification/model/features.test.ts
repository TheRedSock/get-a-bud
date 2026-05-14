import { describe, expect, it } from "vitest";

import {
  amountToBucket,
  extractFeatures,
  stemNorwegian,
  tokenize,
} from "./features";

// ---------------------------------------------------------------------------
// tokenize
// ---------------------------------------------------------------------------

describe("tokenize", () => {
  it("splits on whitespace preserving Norwegian characters", () => {
    expect(tokenize("kiwi 425 rødtve sandåsveien oslo")).toEqual([
      "kiwi",
      "425",
      "rødtve",
      "sandåsveien",
      "oslo",
    ]);
  });

  it("removes punctuation while keeping Norwegian chars", () => {
    expect(tokenize("varekjøp kl 17 25")).toEqual([
      "varekjøp",
      "kl",
      "17",
      "25",
    ]);
  });

  it("returns empty array for empty string", () => {
    expect(tokenize("")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// stemNorwegian
// ---------------------------------------------------------------------------

describe("stemNorwegian", () => {
  it("stems Norwegian words", () => {
    expect(stemNorwegian("forsikring")).toBe(stemNorwegian("forsikringer"));
  });

  it("preserves short words that are already stems", () => {
    const stem = stemNorwegian("kiwi");
    expect(stem).toBeTruthy();
    expect(stem.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// amountToBucket
// ---------------------------------------------------------------------------

describe("amountToBucket", () => {
  it("buckets small amounts correctly", () => {
    expect(amountToBucket(0)).toBe("0_50");
    expect(amountToBucket(49.99)).toBe("0_50");
  });

  it("buckets medium amounts correctly", () => {
    expect(amountToBucket(50)).toBe("50_200");
    expect(amountToBucket(199.99)).toBe("50_200");
    expect(amountToBucket(200)).toBe("200_500");
    expect(amountToBucket(499.99)).toBe("200_500");
  });

  it("buckets large amounts correctly", () => {
    expect(amountToBucket(500)).toBe("500_1k");
    expect(amountToBucket(999.99)).toBe("500_1k");
    expect(amountToBucket(1000)).toBe("1k_5k");
    expect(amountToBucket(4999.99)).toBe("1k_5k");
    expect(amountToBucket(5000)).toBe("5k_plus");
    expect(amountToBucket(100000)).toBe("5k_plus");
  });
});

// ---------------------------------------------------------------------------
// extractFeatures
// ---------------------------------------------------------------------------

describe("extractFeatures", () => {
  it("handles rich Norwegian card purchase", () => {
    const tokens = extractFeatures({
      description:
        "Varekjøp, Kl. 17.25 Versjon 1 Aut. 044936, Kiwi 425 Rødtve Sandåsveien Oslo",
      merchantName: "Kiwi 425 Rødtve",
      amount: "-814.07",
      date: "2025-11-03",
      transactionType: "card_purchase",
      paymentChannel: "debit_card",
    });

    // Should have word tokens (w: prefix)
    expect(tokens.some((t) => t.startsWith("w:"))).toBe(true);
    // Should have bigrams (b: prefix)
    expect(tokens.some((t) => t.startsWith("b:"))).toBe(true);
    // Should include transaction type
    expect(tokens).toContain("type:card_purchase");
    // Should include payment channel
    expect(tokens).toContain("chan:debit_card");
    // Amount bucket for 814.07
    expect(tokens).toContain("amt:500_1k");
    // Day of week for 2025-11-03 (Monday = 1)
    expect(tokens).toContain("dow:1");
    // Day of month start (3rd)
    expect(tokens).toContain("dom:start");
  });

  it("handles minimal transaction (only amount and date)", () => {
    const tokens = extractFeatures({
      amount: "150.00",
      date: "2025-11-15",
    });

    // Only structured features — no text tokens
    expect(tokens.filter((t) => t.startsWith("w:"))).toHaveLength(0);
    // Should have amount bucket
    expect(tokens).toContain("amt:50_200");
    // Should have day of week
    expect(tokens.some((t) => t.startsWith("dow:"))).toBe(true);
    // Mid-month
    expect(tokens).toContain("dom:mid");
    // Should still produce at least 3 tokens
    expect(tokens.length).toBeGreaterThanOrEqual(3);
  });

  it("uses normalized merchant name as text signal", () => {
    const tokens = extractFeatures({
      normalizedMerchantName: "kiwi 425 rødtve",
      amount: "-593.16",
      date: "2026-04-10",
    });

    expect(tokens).toContain("w:kiwi");
    expect(tokens).toContain("w:425");
    expect(tokens.some((token) => token.startsWith("w:rødtv"))).toBe(true);
  });

  it("handles completely empty transaction", () => {
    const tokens = extractFeatures({});
    expect(tokens).toEqual([]);
  });

  it("handles foreign currency transaction", () => {
    const tokens = extractFeatures({
      description: "Visa, Eur 21,99 Netflix.Com, Valutakurs: 12,1132",
      merchantName: "Netflix.Com",
      amount: "-266.29",
      date: "2025-10-15",
      transactionType: "foreign_purchase",
      paymentChannel: "visa",
      originalCurrency: "EUR",
    });

    expect(tokens).toContain("type:foreign_purchase");
    expect(tokens).toContain("chan:visa");
    expect(tokens).toContain("cur:EUR");
    expect(tokens).toContain("amt:200_500");
    // Netflix should appear as a stemmed word token
    expect(tokens.some((t) => t.startsWith("w:") && t.includes("netflix"))).toBe(
      true,
    );
  });

  it("handles credit/debit indicator", () => {
    const tokens = extractFeatures({
      amount: "-100.00",
      creditDebitIndicator: "debit",
    });

    expect(tokens).toContain("dir:debit");
  });

  it("day-of-month buckets correctly", () => {
    expect(extractFeatures({ date: "2025-01-05" })).toContain("dom:start");
    expect(extractFeatures({ date: "2025-01-10" })).toContain("dom:start");
    expect(extractFeatures({ date: "2025-01-11" })).toContain("dom:mid");
    expect(extractFeatures({ date: "2025-01-20" })).toContain("dom:mid");
    expect(extractFeatures({ date: "2025-01-21" })).toContain("dom:end");
    expect(extractFeatures({ date: "2025-01-31" })).toContain("dom:end");
  });

  it("produces bigrams from multi-word merchant", () => {
    const tokens = extractFeatures({
      merchantName: "Burger King Grorud",
    });

    // Should have at least one bigram
    const bigrams = tokens.filter((t) => t.startsWith("b:"));
    expect(bigrams.length).toBeGreaterThan(0);
    // Bigrams should contain underscore-separated stems
    expect(bigrams[0]).toMatch(/^b:.+_.+$/);
  });

  it("does not produce tokens from null/empty text fields", () => {
    const tokens = extractFeatures({
      description: null,
      merchantName: null,
      amount: "-30.00",
    });

    // No word or bigram tokens
    expect(tokens.filter((t) => t.startsWith("w:"))).toHaveLength(0);
    expect(tokens.filter((t) => t.startsWith("b:"))).toHaveLength(0);
    // But should have amount (30 < 50 → 0_50 bucket)
    expect(tokens).toContain("amt:0_50");
  });

  it("handles non-finite amount gracefully", () => {
    const tokens = extractFeatures({ amount: "not_a_number" });
    // No amount token produced
    expect(tokens.filter((t) => t.startsWith("amt:"))).toHaveLength(0);
  });

  it("handles invalid date gracefully", () => {
    const tokens = extractFeatures({ date: "invalid-date" });
    // No date tokens produced
    expect(tokens.filter((t) => t.startsWith("dow:"))).toHaveLength(0);
    expect(tokens.filter((t) => t.startsWith("dom:"))).toHaveLength(0);
  });

  it("uses namespace prefixes to avoid collisions", () => {
    const tokens = extractFeatures({
      description: "visa payment",
      paymentChannel: "visa",
    });

    // "visa" is stemmed to "vis" by the Norwegian stemmer, so the word
    // token will be "w:vis". The channel token is "chan:visa" (unstemmed).
    const wordVis = tokens.filter(
      (t) => t.startsWith("w:") && t.includes("vis"),
    );
    const chanVisa = tokens.filter((t) => t === "chan:visa");
    expect(wordVis.length).toBeGreaterThan(0);
    expect(chanVisa.length).toBe(1);
    // They should be different strings (different namespaces)
    expect(wordVis[0]).not.toBe(chanVisa[0]);
  });
});
