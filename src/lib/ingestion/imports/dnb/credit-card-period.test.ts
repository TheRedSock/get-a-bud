import {
  DNB_CREDIT_CARD_PERIOD_FORMAT,
  extractDnbCreditCardMerchant,
  normalizeDnbCreditCardPeriodRow,
} from "./credit-card-period";

describe("DNB credit card period export normalization", () => {
  it("extracts a purchase merchant and classification fields", () => {
    const draft = normalizeDnbCreditCardPeriodRow({
      Dato: "10.04.2026",
      "Beløpet gjelder": "KIWI 425 RØDTVE, Oslo",
      Ut: "593.16",
    });

    expect(draft).toMatchObject({
      kind: "transaction",
      source: "import",
      amountCents: -59316,
      date: "2026-04-10",
      merchantName: "Kiwi 425 Rødtve",
      normalizedMerchantName: "kiwi 425 rødtve",
      transactionType: "card_purchase",
      paymentChannel: "credit_card",
    });
    expect(draft?.metadata).toMatchObject({
      observedMerchantName: "Kiwi 425 Rødtve",
      import: {
        format: DNB_CREDIT_CARD_PERIOD_FORMAT,
        provider: "DNB",
      },
    });
  });

  it("marks card payments as internal transfers", () => {
    expect(
      normalizeDnbCreditCardPeriodRow({
        Dato: "25.04.2026",
        "Beløpet gjelder": "Innbetaling",
        Inn: "9983.90",
      }),
    ).toMatchObject({
      kind: "transaction",
      amountCents: 998390,
      transactionType: "internal_transfer",
      excludedFromBudget: true,
    });
  });

  it("parses localized comma amounts without a float bridge", () => {
    expect(
      normalizeDnbCreditCardPeriodRow({
        Dato: "10.04.2026",
        "Beløpet gjelder": "REMA 1000, Oslo",
        Ut: "1 234,56",
      }),
    ).toMatchObject({
      kind: "transaction",
      amountCents: -123456,
    });
  });

  it("separates prior statement balance rows from purchases", () => {
    expect(
      normalizeDnbCreditCardPeriodRow({
        Dato: "25.04.2026",
        "Beløpet gjelder": "Skyldig beløp fra forrige faktura",
        Ut: "9983.90",
      }),
    ).toMatchObject({
      kind: "statement_balance",
      date: "2026-04-25",
    });
  });

  it("does not treat special rows as merchants", () => {
    expect(extractDnbCreditCardMerchant("Innbetaling")).toBeNull();
  });
});
