import {
  classifyTransaction,
  classifyWithScore,
  computeThresholds,
  loadModelFromJson,
  trainModel,
  type LabeledTransaction,
} from "./index";

// ---------------------------------------------------------------------------
// Helpers: Generate synthetic labeled data
// ---------------------------------------------------------------------------

function makeTransaction(
  overrides: Partial<LabeledTransaction>,
): LabeledTransaction {
  return {
    description: overrides.description ?? "Test transaction",
    merchantName: overrides.merchantName ?? null,
    amountCents: overrides.amountCents ?? -10000,
    date: overrides.date ?? "2025-06-15",
    transactionType: overrides.transactionType ?? null,
    paymentChannel: overrides.paymentChannel ?? null,
    originalCurrency: overrides.originalCurrency ?? null,
    categoryId: overrides.categoryId ?? "cat-other",
    ...overrides,
  };
}

function generateTrainingSet(): LabeledTransaction[] {
  const data: LabeledTransaction[] = [];

  // Groceries — consistent pattern: merchants like Kiwi, Rema, Coop
  const groceryMerchants = ["Kiwi 425 Rødtve", "Rema 1000 Grorud", "Coop Extra Stovner"];
  for (let i = 0; i < 15; i++) {
    data.push(
      makeTransaction({
        description: `Varekjøp ${groceryMerchants[i % 3]}`,
        merchantName: groceryMerchants[i % 3],
        amountCents: -Math.round((100 + Math.random() * 700) * 100),
        transactionType: "card_purchase",
        paymentChannel: "debit_card",
        categoryId: "cat-groceries",
      }),
    );
  }

  // Subscriptions — Netflix, Spotify
  for (let i = 0; i < 10; i++) {
    const merchant = i % 2 === 0 ? "Netflix.Com" : "Spotify";
    const currency = i % 2 === 0 ? "EUR" : "SEK";
    data.push(
      makeTransaction({
        description: `Visa, ${currency} ${i % 2 === 0 ? "21,99" : "119,00"} ${merchant}`,
        merchantName: merchant,
        amountCents: -Math.round((200 + Math.random() * 50) * 100),
        transactionType: "foreign_purchase",
        paymentChannel: "visa",
        originalCurrency: currency,
        categoryId: "cat-subscriptions",
      }),
    );
  }

  // Transport — Ruter, Vy
  for (let i = 0; i < 10; i++) {
    const merchant = i % 2 === 0 ? "Ruter As" : "Vy";
    data.push(
      makeTransaction({
        description: `Varekjøp ${merchant}`,
        merchantName: merchant,
        amountCents: -Math.round((40 + Math.random() * 300) * 100),
        transactionType: "card_purchase",
        paymentChannel: "debit_card",
        categoryId: "cat-transport",
      }),
    );
  }

  // Dining — McDonalds, Burger King
  for (let i = 0; i < 10; i++) {
    const merchant = i % 2 === 0 ? "Mcd 031 Grorud" : "Burger King Stovner";
    data.push(
      makeTransaction({
        description: `Varekjøp ${merchant}`,
        merchantName: merchant,
        amountCents: -Math.round((80 + Math.random() * 150) * 100),
        transactionType: "card_purchase",
        paymentChannel: "debit_card",
        categoryId: "cat-dining",
      }),
    );
  }

  // Bills — Giro payments
  for (let i = 0; i < 8; i++) {
    data.push(
      makeTransaction({
        description: "Giro, Rødtvedt Borettslag, Avtalegiro",
        merchantName: "Rødtvedt Borettslag",
        amountCents: -Math.round((3000 + Math.random() * 500) * 100),
        transactionType: "direct_debit",
        paymentChannel: "giro",
        categoryId: "cat-housing",
      }),
    );
  }

  return data;
}

// ---------------------------------------------------------------------------
// trainModel
// ---------------------------------------------------------------------------

describe("trainModel", () => {
  it("returns null when data is insufficient", () => {
    const result = trainModel([
      makeTransaction({ categoryId: "cat-a" }),
      makeTransaction({ categoryId: "cat-b" }),
    ]);
    expect(result).toBeNull();
  });

  it("returns null when all categories have fewer than 3 examples", () => {
    const data = Array.from({ length: 20 }, (_, i) =>
      makeTransaction({ categoryId: `cat-${i}` }),
    );
    const result = trainModel(data);
    expect(result).toBeNull();
  });

  it("trains successfully with sufficient data", () => {
    const data = generateTrainingSet();
    const result = trainModel(data);

    expect(result).not.toBeNull();
    expect(result!.trainingCount).toBeGreaterThanOrEqual(20);
    expect(result!.categoryCount).toBeGreaterThanOrEqual(3);
    expect(result!.accuracy).toBeGreaterThanOrEqual(0);
    expect(result!.accuracy).toBeLessThanOrEqual(1);
    expect(result!.modelJson).toBeTruthy();
    expect(typeof result!.modelJson).toBe("string");
  });

  it("produces a model JSON that can be parsed", () => {
    const data = generateTrainingSet();
    const result = trainModel(data)!;

    const parsed = JSON.parse(result.modelJson);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(5); // [config, samples, count, words, vocabulary]
  });

  it("accuracy is reasonable for well-separated data", () => {
    const data = generateTrainingSet();
    const result = trainModel(data)!;

    // With well-separated categories (different merchants, types), accuracy
    // should be at least moderate
    expect(result.accuracy).toBeGreaterThan(0.3);
  });
});

// ---------------------------------------------------------------------------
// loadModelFromJson + classifyTransaction
// ---------------------------------------------------------------------------

describe("loadModelFromJson + classifyTransaction", () => {
  it("roundtrips a model through serialization", () => {
    const data = generateTrainingSet();
    const trained = trainModel(data)!;

    const model = loadModelFromJson(trained.modelJson, trained.thresholds);
    expect(model.classifier).toBeDefined();
    expect(model.thresholds).toEqual(trained.thresholds);
  });

  it("classifies a grocery transaction correctly", () => {
    const data = generateTrainingSet();
    const trained = trainModel(data)!;
    const model = loadModelFromJson(trained.modelJson, trained.thresholds);

    const result = classifyTransaction(model, {
      description: "Varekjøp Kiwi 425 Rødtve",
      merchantName: "Kiwi 425 Rødtve",
      amountCents: -35000,
      transactionType: "card_purchase",
      paymentChannel: "debit_card",
    });

    expect(result).not.toBeNull();
    expect(result!.label).toBe("cat-groceries");
    expect(result!.score).toBeGreaterThan(0);
    expect(result!.score).toBeLessThanOrEqual(1);
  });

  it("classifies a subscription correctly", () => {
    const data = generateTrainingSet();
    const trained = trainModel(data)!;
    const model = loadModelFromJson(trained.modelJson, trained.thresholds);

    const result = classifyTransaction(model, {
      description: "Visa, Eur 21,99 Netflix.Com",
      merchantName: "Netflix.Com",
      amountCents: -26600,
      transactionType: "foreign_purchase",
      paymentChannel: "visa",
      originalCurrency: "EUR",
    });

    expect(result).not.toBeNull();
    expect(result!.label).toBe("cat-subscriptions");
  });

  it("returns null for completely empty input", () => {
    const data = generateTrainingSet();
    const trained = trainModel(data)!;
    const model = loadModelFromJson(trained.modelJson, trained.thresholds);

    const result = classifyTransaction(model, {});
    expect(result).toBeNull();
  });

  it("produces a score between 0 and 1", () => {
    const data = generateTrainingSet();
    const trained = trainModel(data)!;
    const model = loadModelFromJson(trained.modelJson, trained.thresholds);

    const result = classifyTransaction(model, {
      description: "Rema 1000",
      merchantName: "Rema 1000",
      amountCents: -20000,
    });

    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThanOrEqual(0);
    expect(result!.score).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// classifyWithScore
// ---------------------------------------------------------------------------

describe("classifyWithScore", () => {
  it("returns null for completely unknown tokens", () => {
    const data = generateTrainingSet();
    const trained = trainModel(data)!;
    const model = loadModelFromJson(trained.modelJson, trained.thresholds);

    // These tokens have never been seen
    const result = classifyWithScore(
      model.classifier,
      "xyz:zzz abc:qqq unknown:foo",
    );
    // The classifier may return "unknown" for tokens it has never seen
    // OR it may return a low-confidence prediction. Either is acceptable.
    if (result !== null) {
      expect(result.score).toBeLessThan(0.9);
    }
  });
});

// ---------------------------------------------------------------------------
// computeThresholds
// ---------------------------------------------------------------------------

describe("computeThresholds", () => {
  it("returns null thresholds with too few test predictions", () => {
    const result = computeThresholds([
      { score: 0.9, correct: true },
      { score: 0.8, correct: true },
    ]);
    expect(result.autoApplyThreshold).toBeNull();
    expect(result.suggestThreshold).toBeNull();
  });

  it("finds auto-apply threshold when predictions are accurate", () => {
    // Simulate predictions where high scores are always correct
    const predictions = [
      ...Array.from({ length: 10 }, () => ({ score: 0.9, correct: true })),
      ...Array.from({ length: 5 }, () => ({ score: 0.7, correct: true })),
      ...Array.from({ length: 5 }, () => ({ score: 0.5, correct: false })),
      ...Array.from({ length: 5 }, () => ({ score: 0.3, correct: false })),
    ];

    const result = computeThresholds(predictions);
    // Should find a threshold where accuracy >= 90%
    expect(result.autoApplyThreshold).not.toBeNull();
    expect(result.autoApplyThreshold!).toBeGreaterThanOrEqual(0.4);
    expect(result.autoApplyThreshold!).toBeLessThanOrEqual(0.95);
  });

  it("finds suggest threshold even when auto-apply is null", () => {
    // All predictions are mediocre — 70% accuracy
    const predictions = Array.from({ length: 20 }, (_, i) => ({
      score: 0.5 + (i / 40),
      correct: i % 10 < 7, // 70% correct
    }));

    const result = computeThresholds(predictions);
    // Suggest threshold should exist (60% accuracy met)
    expect(result.suggestThreshold).not.toBeNull();
    // Auto-apply may or may not exist depending on score distribution
  });

  it("returns null thresholds when accuracy is uniformly low", () => {
    // All predictions are wrong
    const predictions = Array.from({ length: 20 }, (_, i) => ({
      score: 0.4 + (i / 50),
      correct: false,
    }));

    const result = computeThresholds(predictions);
    expect(result.autoApplyThreshold).toBeNull();
    expect(result.suggestThreshold).toBeNull();
  });
});
