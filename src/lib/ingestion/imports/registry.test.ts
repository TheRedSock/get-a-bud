import { DNB_CREDIT_CARD_PERIOD_FORMAT } from "./dnb/credit-card-period";
import { detectImportFormat, normalizeImportRow } from "./registry";

describe("import format registry", () => {
  it("detects DNB credit card period rows by required headers", () => {
    const row = {
      Dato: "10.04.2026",
      "Beløpet gjelder": "KIWI 425 RØDTVE, Oslo",
      Ut: "593.16",
    };

    expect(detectImportFormat(row)?.id).toBe(DNB_CREDIT_CARD_PERIOD_FORMAT);
    expect(normalizeImportRow(row)).toMatchObject({
      kind: "transaction",
      merchantName: "Kiwi 425 Rødtve",
    });
  });

  it("can route by explicit format id", () => {
    expect(
      normalizeImportRow(
        {
          Dato: "25.04.2026",
          "Beløpet gjelder": "Innbetaling",
          Inn: "9983.90",
        },
        { formatId: DNB_CREDIT_CARD_PERIOD_FORMAT },
      ),
    ).toMatchObject({
      kind: "transaction",
      transactionType: "internal_transfer",
    });
  });
});
