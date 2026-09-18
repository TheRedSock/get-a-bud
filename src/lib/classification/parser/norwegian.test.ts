import { parseDescription } from "./index";
import {
  parseCash,
  parseFee,
  parseGiro,
  parseInterest,
  parseKontoregulering,
  parseLoan,
  parseNorwegianDecimal,
  parseSalary,
  parseTransfer,
  parseTransferInnland,
  parseVarekjop,
  parseVarekjopKib,
  parseVisa,
  parseVisaFee,
} from "./norwegian";

// ---------------------------------------------------------------------------
// Helper: parseNorwegianDecimal
// ---------------------------------------------------------------------------

describe("parseNorwegianDecimal", () => {
  it("converts comma decimal separator", () => {
    expect(parseNorwegianDecimal("21,99")).toBe("21.99");
  });

  it("handles thousands separator with comma decimal", () => {
    expect(parseNorwegianDecimal("1.234,56")).toBe("1234.56");
  });

  it("handles whole numbers", () => {
    expect(parseNorwegianDecimal("100")).toBe("100");
  });

  it("handles large amounts", () => {
    expect(parseNorwegianDecimal("12.345.678,90")).toBe("12345678.90");
  });
});

// ---------------------------------------------------------------------------
// Family 1: Varekjøp (card purchase)
// ---------------------------------------------------------------------------

describe("parseVarekjop", () => {
  it("parses standard Varekjøp with merchant", () => {
    const result = parseVarekjop(
      "Varekjøp, Kl. 14.30 Versjon 1 Aut. 123456, Rema 1000 Storgata Oslo",
    );
    expect(result).not.toBeNull();
    expect(result!.transactionType).toBe("card_purchase");
    expect(result!.paymentChannel).toBe("debit_card");
    expect(result!.merchantName).toBe("Rema 1000 Storgata Oslo");
    expect(result!.metadata.time).toBe("14.30");
    expect(result!.metadata.authCode).toBe("123456");
  });

  it("handles two-segment Varekjøp (no separate merchant)", () => {
    const result = parseVarekjop(
      "Varekjøp, Kl. 09.15 Versjon 1 Aut. 789012",
    );
    expect(result).not.toBeNull();
    expect(result!.transactionType).toBe("card_purchase");
    expect(result!.merchantName).toBeNull();
  });
});

describe("parseVarekjopKib", () => {
  it("parses Varekjøp Med Kib format", () => {
    const result = parseVarekjopKib(
      "Varekjøp Med Kib, Ark.Ref *12345 Dato 01.05, Kl. 10.30 Versjon 1 Aut. 654321, Kiwi Grorud",
    );
    expect(result).not.toBeNull();
    expect(result!.transactionType).toBe("card_purchase");
    expect(result!.paymentChannel).toBe("debit_card");
    expect(result!.merchantName).toBe("Kiwi Grorud");
    expect(result!.metadata.refNumber).toBe("12345");
    expect(result!.metadata.authCode).toBe("654321");
  });
});

// ---------------------------------------------------------------------------
// Family 2: Giro
// ---------------------------------------------------------------------------

describe("parseGiro", () => {
  it("parses Giro with Avtalegiro type", () => {
    const result = parseGiro("12345 Giro, Fortum As, Avtalegiro FORTUM AS");
    expect(result).not.toBeNull();
    expect(result!.transactionType).toBe("direct_debit");
    expect(result!.paymentChannel).toBe("giro");
    expect(result!.merchantName).toBe("Fortum As");
  });

  it("parses Giro with Efaktura type", () => {
    const result = parseGiro("Giro, Telenor Norge As, Efaktura");
    expect(result).not.toBeNull();
    expect(result!.transactionType).toBe("e_invoice");
    expect(result!.merchantName).toBe("Telenor Norge As");
  });

  it("parses Giro with Fondshandel type", () => {
    const result = parseGiro("Giro, Dnb Bank Asa, Fondshandel");
    expect(result).not.toBeNull();
    expect(result!.transactionType).toBe("investment");
    expect(result!.merchantName).toBe("Dnb Bank Asa");
  });

  it("parses Giro with Fast Oppdrag type", () => {
    const result = parseGiro("Giro, Husleie Utleier, Fast Oppdrag");
    expect(result).not.toBeNull();
    expect(result!.transactionType).toBe("standing_order");
    expect(result!.merchantName).toBe("Husleie Utleier");
  });

  it("parses Giro with detail segments", () => {
    const result = parseGiro(
      "67890 Giro, If Skadeforsikring, Avtalegiro, Terminbeløp Apr. 2025 IF SKADEFORSIKRING",
    );
    expect(result).not.toBeNull();
    expect(result!.transactionType).toBe("direct_debit");
    expect(result!.merchantName).toBe("If Skadeforsikring");
  });

  it("parses Giro with double-space before number", () => {
    const result = parseGiro("Giro  12345, Creditor Name, Avtalegiro");
    expect(result).not.toBeNull();
    expect(result!.merchantName).toBe("Creditor Name");
  });

  it("parses leading reference with hyphens", () => {
    const result = parseGiro("123-456 Giro, Some Company, Efaktura");
    expect(result).not.toBeNull();
    expect(result!.transactionType).toBe("e_invoice");
    expect(result!.merchantName).toBe("Some Company");
  });
});

// ---------------------------------------------------------------------------
// Family 3: Kontoregulering
// ---------------------------------------------------------------------------

describe("parseKontoregulering", () => {
  it("identifies Mellom Egne Konti as internal_transfer", () => {
    const result = parseKontoregulering(
      "Kontoregulering, Overføring Mellom Egne Konti",
    );
    expect(result).not.toBeNull();
    expect(result!.transactionType).toBe("internal_transfer");
    expect(result!.paymentChannel).toBe("internal");
  });

  it("identifies Mobil Overføring as bank_transfer", () => {
    const result = parseKontoregulering("Kontoregulering, Mobil Overføring");
    expect(result).not.toBeNull();
    expect(result!.transactionType).toBe("bank_transfer");
  });

  it("handles free-text description", () => {
    const result = parseKontoregulering(
      "Kontoregulering, Vacation Savings Melina",
    );
    expect(result).not.toBeNull();
    expect(result!.transactionType).toBe("internal_transfer");
    expect(result!.purpose).toBe("Vacation Savings Melina");
  });

  it("handles Dnb Bank Asa reference", () => {
    const result = parseKontoregulering(
      "Kontoregulering, Dnb Bank Asa, 12345678",
    );
    expect(result).not.toBeNull();
    expect(result!.transactionType).toBe("internal_transfer");
  });
});

// ---------------------------------------------------------------------------
// Family 4: Lån (loan payment)
// ---------------------------------------------------------------------------

describe("parseLoan", () => {
  it("parses full loan payment breakdown", () => {
    const result = parseLoan(
      "Lån, Lån 1234.56.78901, Avdrag Kr 3.500,00, Renter Kr 1.234,56, Omk. Kr 50,00",
    );
    expect(result).not.toBeNull();
    expect(result!.transactionType).toBe("loan_payment");
    expect(result!.paymentChannel).toBe("loan");
    expect(result!.metadata.loanAccount).toBe("1234.56.78901");
    expect(result!.metadata.principal).toBe("3500.00");
    expect(result!.metadata.interest).toBe("1234.56");
    expect(result!.metadata.fees).toBe("50.00");
  });

  it("handles simple loan format", () => {
    const result = parseLoan("Lån, Some description");
    expect(result).not.toBeNull();
    expect(result!.transactionType).toBe("loan_payment");
    expect(result!.purpose).toBe("Some description");
  });
});

// ---------------------------------------------------------------------------
// Family 5: Lønn (salary)
// ---------------------------------------------------------------------------

describe("parseSalary", () => {
  it("extracts employer name", () => {
    const result = parseSalary("Lønn, Equinor Asa");
    expect(result).not.toBeNull();
    expect(result!.transactionType).toBe("salary");
    expect(result!.paymentChannel).toBe("salary");
    expect(result!.merchantName).toBe("Equinor Asa");
    expect(result!.counterparty).toBe("Equinor Asa");
  });
});

// ---------------------------------------------------------------------------
// Family 6: Overføring Innland (domestic transfer)
// ---------------------------------------------------------------------------

describe("parseTransferInnland", () => {
  it("detects Vipps transfer", () => {
    const result = parseTransferInnland(
      "Overføring Innland, Ola Nordmann, Betaling, Tpp: Vipps Mobilepay As",
    );
    expect(result).not.toBeNull();
    expect(result!.transactionType).toBe("p2p_payment");
    expect(result!.paymentChannel).toBe("vipps");
    expect(result!.counterparty).toBe("Ola Nordmann");
  });

  it("detects Vipps transfer with message", () => {
    const result = parseTransferInnland(
      "Overføring Innland, Kari Hansen, Betaling, Tpp: Vipps Mobilepay As, Middag",
    );
    expect(result).not.toBeNull();
    expect(result!.transactionType).toBe("p2p_payment");
    expect(result!.counterparty).toBe("Kari Hansen");
  });

  it("detects tax payment", () => {
    const result = parseTransferInnland(
      "Overføring Innland, Skatteetaten - Skatteinnkreving, Skatt",
    );
    expect(result).not.toBeNull();
    expect(result!.transactionType).toBe("bank_transfer");
    expect(result!.counterparty).toBe("Skatteetaten - Skatteinnkreving");
  });

  it("parses simple transfer", () => {
    const result = parseTransferInnland("Overføring Innland, Per Olsen");
    expect(result).not.toBeNull();
    expect(result!.transactionType).toBe("bank_transfer");
    expect(result!.counterparty).toBe("Per Olsen");
  });

  it("handles Mobilbank Dato format", () => {
    const result = parseTransferInnland(
      "Overføring Innland, Mobilbank Dato 01.05 Kl. 14.30, Some Person",
    );
    expect(result).not.toBeNull();
    expect(result!.counterparty).toBe("Some Person");
  });

  it("handles Nettbank Overføring format", () => {
    const result = parseTransferInnland(
      "Overføring Innland, Nettbank Overføring, Person Name",
    );
    expect(result).not.toBeNull();
    expect(result!.counterparty).toBe("Person Name");
  });

  it("handles Overførsel Innland spelling variant", () => {
    const result = parseDescription(
      "Overførsel Innland, Test Person",
      "enable_banking",
      { country: "NO" },
    );
    expect(result).not.toBeNull();
    expect(result!.transactionType).toBe("bank_transfer");
  });
});

// ---------------------------------------------------------------------------
// Family 7: Overføring (no "Innland")
// ---------------------------------------------------------------------------

describe("parseTransfer", () => {
  it("parses basic transfer", () => {
    const result = parseTransfer("Overføring, Some Person, Payment message");
    expect(result).not.toBeNull();
    expect(result!.transactionType).toBe("bank_transfer");
    expect(result!.counterparty).toBe("Some Person");
    expect(result!.purpose).toBe("Payment message");
  });

  it("detects Vipps involvement", () => {
    const result = parseTransfer(
      "Overføring, Someone, Betaling, Tpp: Vipps Mobilepay As",
    );
    expect(result).not.toBeNull();
    expect(result!.transactionType).toBe("p2p_payment");
    expect(result!.paymentChannel).toBe("vipps");
  });
});

// ---------------------------------------------------------------------------
// Family 8: Visa (multiple sub-formats)
// ---------------------------------------------------------------------------

describe("parseVisa", () => {
  it("8a: parses foreign currency transaction (EUR)", () => {
    const result = parseVisa(
      "Visa, Eur 21,99 Netflix.Com, Valutakurs:    12,1132",
    );
    expect(result).not.toBeNull();
    expect(result!.transactionType).toBe("foreign_purchase");
    expect(result!.paymentChannel).toBe("visa");
    expect(result!.merchantName).toBe("Netflix.Com");
    expect(result!.metadata.originalCurrency).toBe("EUR");
    expect(result!.metadata.originalAmount).toBe("21,99");
    expect(result!.metadata.exchangeRate).toBe("12,1132");
  });

  it("8a: parses foreign currency transaction (GBP)", () => {
    const result = parseVisa(
      "Visa, Gbp 5,99 Itvx Premium, Valutakurs:    13,2353",
    );
    expect(result).not.toBeNull();
    expect(result!.transactionType).toBe("foreign_purchase");
    expect(result!.merchantName).toBe("Itvx Premium");
    expect(result!.metadata.originalCurrency).toBe("GBP");
  });

  it("8a: parses foreign currency with multi-word merchant", () => {
    const result = parseVisa(
      "Visa, Usd 20,00 Cursor, Ai Powered, Valutakurs:    10,3480",
    );
    expect(result).not.toBeNull();
    expect(result!.transactionType).toBe("foreign_purchase");
    // With the comma in "Cursor, Ai Powered", the regex should capture up to the last ", Valutakurs:"
    expect(result!.metadata.originalCurrency).toBe("USD");
  });

  it("8a: parses SEK transaction", () => {
    const result = parseVisa(
      "Visa, Sek 428,10 Systembolaget, Valutakurs:     1,0922",
    );
    expect(result).not.toBeNull();
    expect(result!.merchantName).toBe("Systembolaget");
    expect(result!.metadata.originalCurrency).toBe("SEK");
  });

  it("8b: parses NOK online purchase", () => {
    const result = parseVisa("Visa, Nok 199,00 Komplett.No");
    expect(result).not.toBeNull();
    expect(result!.transactionType).toBe("online_purchase");
    expect(result!.merchantName).toBe("Komplett.No");
  });

  it("8c: parses Vipps purchase", () => {
    const result = parseVisa("Visa, Vipps:Kaffebrenneriet");
    expect(result).not.toBeNull();
    expect(result!.transactionType).toBe("vipps_purchase");
    expect(result!.paymentChannel).toBe("vipps");
    expect(result!.merchantName).toBe("Kaffebrenneriet");
  });

  it("8d: parses PayPal purchase", () => {
    const result = parseVisa("Visa, Paypal :SomeStore");
    expect(result).not.toBeNull();
    expect(result!.transactionType).toBe("online_purchase");
    expect(result!.paymentChannel).toBe("paypal");
    expect(result!.merchantName).toBe("SomeStore");
  });

  it("8d: parses Pp: PayPal variant", () => {
    const result = parseVisa("Visa, Pp:AnotherStore");
    expect(result).not.toBeNull();
    expect(result!.paymentChannel).toBe("paypal");
    expect(result!.merchantName).toBe("AnotherStore");
  });

  it("8d: strips PayPal reference suffix from merchant name", () => {
    const p3 = parseVisa("Visa, Paypal :Spotify:P3");
    const p4 = parseVisa("Visa, Paypal :Spotify:P4");
    expect(p3!.merchantName).toBe("Spotify");
    expect(p4!.merchantName).toBe("Spotify");
    // Both resolve to the same merchant regardless of PayPal ref rotation
    expect(p3!.merchantName).toBe(p4!.merchantName);
  });

  it("8d: strips PayPal reference suffix with Pp: prefix", () => {
    const result = parseVisa("Visa, Pp:SomeService:P12");
    expect(result!.merchantName).toBe("SomeService");
    expect(result!.paymentChannel).toBe("paypal");
  });

  it("8d: preserves merchant names without PayPal reference suffix", () => {
    // Colons that aren't PayPal reference codes should be preserved
    const result = parseVisa("Visa, Paypal :Some:Merchant");
    expect(result!.merchantName).toBe("Some:Merchant");
  });

  it("8e: parses Zettle purchase", () => {
    const result = parseVisa("Visa, Zettle_:Coffee Shop");
    expect(result).not.toBeNull();
    expect(result!.transactionType).toBe("card_purchase");
    expect(result!.paymentChannel).toBe("zettle");
    expect(result!.merchantName).toBe("Coffee Shop");
  });

  it("8f: parses date-reference format", () => {
    const result = parseVisa("Visa, 1/5_12345_Some Merchant");
    expect(result).not.toBeNull();
    expect(result!.transactionType).toBe("card_purchase");
    expect(result!.merchantName).toBe("Some Merchant");
  });

  it("8g: parses simple merchant (fallback)", () => {
    const result = parseVisa("Visa, Elkjøp Bergen");
    expect(result).not.toBeNull();
    expect(result!.transactionType).toBe("card_purchase");
    expect(result!.paymentChannel).toBe("visa");
    expect(result!.merchantName).toBe("Elkjøp Bergen");
  });
});

describe("parseVisaFee", () => {
  it("8h: parses Visa-Kostnad", () => {
    const result = parseVisaFee("Visa-Kostnad, Årsavgift Visa");
    expect(result).not.toBeNull();
    expect(result!.transactionType).toBe("fee");
    expect(result!.paymentChannel).toBe("visa");
    expect(result!.merchantName).toBeNull();
    expect(result!.purpose).toBe("Årsavgift Visa");
  });
});

// ---------------------------------------------------------------------------
// Family 9: Miscellaneous
// ---------------------------------------------------------------------------

describe("parseInterest", () => {
  it("parses interest entry", () => {
    const result = parseInterest("Renter, Brukskonto");
    expect(result).not.toBeNull();
    expect(result!.transactionType).toBe("interest");
    expect(result!.merchantName).toBeNull();
    expect(result!.purpose).toBe("Brukskonto");
  });

  it("parses bare Renter", () => {
    const result = parseInterest("Renter");
    expect(result).not.toBeNull();
    expect(result!.transactionType).toBe("interest");
  });
});

describe("parseFee", () => {
  it("parses Prislagte Tjenester", () => {
    const result = parseFee("Prislagte Tjenester");
    expect(result).not.toBeNull();
    expect(result!.transactionType).toBe("fee");
  });

  it("parses Omkostninger", () => {
    const result = parseFee("Omkostninger, Some Detail");
    expect(result).not.toBeNull();
    expect(result!.transactionType).toBe("fee");
    expect(result!.purpose).toBe("Some Detail");
  });

  it("parses Honorar fond", () => {
    const result = parseFee("Honorar fond, Fund Fee Detail");
    expect(result).not.toBeNull();
    expect(result!.transactionType).toBe("fee");
  });
});

describe("parseCash", () => {
  it("parses cash withdrawal", () => {
    const result = parseCash("Uttak/innskudd, Minibank Oslo S");
    expect(result).not.toBeNull();
    expect(result!.transactionType).toBe("cash_withdrawal");
    expect(result!.purpose).toBe("Minibank Oslo S");
  });
});

// ---------------------------------------------------------------------------
// Phase 1C: Original currency integration
// ---------------------------------------------------------------------------

describe("Phase 1C: foreign currency field extraction for DB storage", () => {
  it("converts EUR parser output to DB-ready values", () => {
    const result = parseVisa(
      "Visa, Eur 21,99 Netflix.Com, Valutakurs:    12,1132",
    );
    expect(result).not.toBeNull();
    const originalCurrency = String(result!.metadata.originalCurrency).toUpperCase();
    const originalAmount = parseNorwegianDecimal(String(result!.metadata.originalAmount));
    expect(originalCurrency).toBe("EUR");
    expect(originalAmount).toBe("21.99");
  });

  it("converts USD parser output to DB-ready values", () => {
    const result = parseVisa(
      "Visa, Usd 20,00 Cursor, Ai Powered, Valutakurs:    10,3480",
    );
    expect(result).not.toBeNull();
    const originalCurrency = String(result!.metadata.originalCurrency).toUpperCase();
    const originalAmount = parseNorwegianDecimal(String(result!.metadata.originalAmount));
    expect(originalCurrency).toBe("USD");
    expect(originalAmount).toBe("20.00");
  });

  it("converts SEK parser output to DB-ready values", () => {
    const result = parseVisa(
      "Visa, Sek 428,10 Systembolaget, Valutakurs:     1,0922",
    );
    expect(result).not.toBeNull();
    const originalAmount = parseNorwegianDecimal(String(result!.metadata.originalAmount));
    expect(originalAmount).toBe("428.10");
  });

  it("converts GBP parser output to DB-ready values", () => {
    const result = parseVisa(
      "Visa, Gbp 5,99 Itvx Premium, Valutakurs:    13,2353",
    );
    expect(result).not.toBeNull();
    const originalAmount = parseNorwegianDecimal(String(result!.metadata.originalAmount));
    expect(originalAmount).toBe("5.99");
  });

  it("returns no currency fields for NOK Visa transactions", () => {
    const result = parseVisa("Visa, Nok 199,00 Komplett.No");
    expect(result).not.toBeNull();
    expect(result!.metadata.originalCurrency).toBeUndefined();
  });

  it("returns no currency fields for simple Visa transactions", () => {
    const result = parseVisa("Visa, Elkjøp Bergen");
    expect(result).not.toBeNull();
    expect(result!.metadata.originalCurrency).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Dispatcher: parseDescription
// ---------------------------------------------------------------------------

describe("parseDescription", () => {
  it("returns null for manual transactions", () => {
    expect(
      parseDescription("Varekjøp, Kl. 14.30 Versjon 1 Aut. 123, Rema", "manual"),
    ).toBeNull();
  });

  it("returns null for import transactions", () => {
    expect(
      parseDescription("Varekjøp, Kl. 14.30 Versjon 1 Aut. 123, Rema", "import"),
    ).toBeNull();
  });

  it("returns null for non-Norwegian enable_banking", () => {
    expect(
      parseDescription("Some description", "enable_banking", { country: "SE" }),
    ).toBeNull();
  });

  it("returns null when enable_banking country is unknown", () => {
    expect(
      parseDescription(
        "Varekjøp, Kl. 14.30 Versjon 1 Aut. 123, Rema",
        "enable_banking",
      ),
    ).toBeNull();
  });

  it("parses Norwegian enable_banking transactions", () => {
    const result = parseDescription(
      "Lønn, Test Employer",
      "enable_banking",
      { country: "NO" },
    );
    expect(result).not.toBeNull();
    expect(result!.transactionType).toBe("salary");
  });

  it("returns null for unrecognized descriptions", () => {
    expect(
      parseDescription("Random unknown text", "enable_banking", { country: "NO" }),
    ).toBeNull();
  });

  it("returns null for Opening balance adjustment", () => {
    expect(
      parseDescription("Opening balance adjustment", "enable_banking", {
        country: "NO",
      }),
    ).toBeNull();
  });

  it("returns null for empty description", () => {
    expect(parseDescription("", "enable_banking")).toBeNull();
  });

  it("returns null for whitespace-only description", () => {
    expect(parseDescription("   ", "enable_banking")).toBeNull();
  });

  it("dispatches Varekjøp Med Kib before standard Varekjøp", () => {
    const result = parseDescription(
      "Varekjøp Med Kib, Ark.Ref *111 Dato 01.05, Kl. 10.00 Versjon 1 Aut. 222, Store",
      "enable_banking",
      { country: "NO" },
    );
    expect(result).not.toBeNull();
    expect(result!.metadata.refNumber).toBe("111");
  });

  it("dispatches Visa-Kostnad before Visa", () => {
    const result = parseDescription(
      "Visa-Kostnad, Card Fee",
      "enable_banking",
      { country: "NO" },
    );
    expect(result).not.toBeNull();
    expect(result!.transactionType).toBe("fee");
  });

  it("dispatches Giro with leading ref number", () => {
    const result = parseDescription(
      "12345 Giro, Company, Avtalegiro",
      "enable_banking",
      { country: "NO" },
    );
    expect(result).not.toBeNull();
    expect(result!.transactionType).toBe("direct_debit");
  });

  it("preserves Norwegian characters (æøå)", () => {
    const result = parseDescription(
      "Lønn, Blåfjell Produksjon",
      "enable_banking",
      { country: "NO" },
    );
    expect(result).not.toBeNull();
    expect(result!.merchantName).toBe("Blåfjell Produksjon");
  });
});
