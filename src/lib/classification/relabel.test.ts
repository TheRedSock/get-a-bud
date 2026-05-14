import { describe, it, expect } from "vitest";

import { generateRelabel } from "./relabel";
import type { RelabelTransactionInput } from "./relabel";
import type { ParsedDescription } from "./parser/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function txn(
  overrides: Partial<RelabelTransactionInput> = {},
): RelabelTransactionInput {
  return {
    description: "Varekjøp, Kl. 17.25 Versjon 1 Aut. 044936, Kiwi 425 Rødtve",
    merchantName: null,
    metadata: null,
    ...overrides,
  };
}

function parsed(
  overrides: Partial<ParsedDescription> = {},
): ParsedDescription {
  return {
    transactionType: "card_purchase",
    paymentChannel: "debit_card",
    merchantName: "Kiwi 425 Rødtvet",
    merchantAddress: null,
    counterparty: null,
    purpose: null,
    metadata: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Quality gate tests
// ---------------------------------------------------------------------------

describe("generateRelabel — quality gates", () => {
  it("returns null when parsed is null", () => {
    expect(generateRelabel(null, txn())).toBeNull();
  });

  it("returns null when parser extracted neither merchantName nor transactionType", () => {
    expect(
      generateRelabel(
        parsed({ merchantName: null, transactionType: undefined as never }),
        txn(),
      ),
    ).toBeNull();
  });

  it("returns null when merchant name is too short (< 2 chars)", () => {
    expect(
      generateRelabel(parsed({ merchantName: "A" }), txn()),
    ).toBeNull();
  });

  it("returns null when merchant name is only whitespace", () => {
    expect(
      generateRelabel(parsed({ merchantName: " " }), txn()),
    ).toBeNull();
  });

  it("returns null when user has edited the description", () => {
    expect(
      generateRelabel(
        parsed(),
        txn({
          metadata: { userEdits: { descriptionEdited: true } },
        }),
      ),
    ).toBeNull();
  });

  it("returns null when user has edited the merchant name", () => {
    expect(
      generateRelabel(
        parsed(),
        txn({
          metadata: { userEdits: { merchantNameEdited: true } },
        }),
      ),
    ).toBeNull();
  });

  it("relabels when userEdits block exists but no edits are flagged", () => {
    const result = generateRelabel(
      parsed(),
      txn({ metadata: { userEdits: {} } }),
    );
    expect(result).not.toBeNull();
    expect(result!.merchantName).toBe("Kiwi 425 Rødtvet");
  });

  it("relabels when metadata is null", () => {
    const result = generateRelabel(parsed(), txn({ metadata: null }));
    expect(result).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Card purchase
// ---------------------------------------------------------------------------

describe("generateRelabel — card_purchase", () => {
  it("uses merchant name as both description and merchantName", () => {
    const result = generateRelabel(parsed(), txn());
    expect(result).toEqual({
      merchantName: "Kiwi 425 Rødtvet",
      description: "Kiwi 425 Rødtvet",
      notes: null,
    });
  });

  it("returns null when merchant is missing", () => {
    expect(
      generateRelabel(
        parsed({ merchantName: null }),
        txn(),
      ),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Foreign purchase
// ---------------------------------------------------------------------------

describe("generateRelabel — foreign_purchase", () => {
  it("includes original currency in notes", () => {
    const result = generateRelabel(
      parsed({
        transactionType: "foreign_purchase",
        merchantName: "Amazon.de",
        metadata: { originalCurrency: "EUR", originalAmount: "29.99" },
      }),
      txn(),
    );
    expect(result).toEqual({
      merchantName: "Amazon.de",
      description: "Amazon.de",
      notes: "Original: EUR 29.99",
    });
  });

  it("omits notes when currency info is missing", () => {
    const result = generateRelabel(
      parsed({
        transactionType: "foreign_purchase",
        merchantName: "Amazon.de",
        metadata: {},
      }),
      txn(),
    );
    expect(result!.notes).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Direct debit / e-invoice / standing order
// ---------------------------------------------------------------------------

describe("generateRelabel — direct_debit", () => {
  it("appends Avtalegiro suffix", () => {
    const result = generateRelabel(
      parsed({ transactionType: "direct_debit", merchantName: "Telenor" }),
      txn(),
    );
    expect(result).toEqual({
      merchantName: "Telenor",
      description: "Telenor - Avtalegiro",
      notes: null,
    });
  });
});

describe("generateRelabel — e_invoice", () => {
  it("appends Efaktura suffix", () => {
    const result = generateRelabel(
      parsed({ transactionType: "e_invoice", merchantName: "Rødtvedt Borettslag" }),
      txn(),
    );
    expect(result).toEqual({
      merchantName: "Rødtvedt Borettslag",
      description: "Rødtvedt Borettslag - Efaktura",
      notes: null,
    });
  });
});

describe("generateRelabel — standing_order", () => {
  it("appends Fast Oppdrag suffix", () => {
    const result = generateRelabel(
      parsed({ transactionType: "standing_order", merchantName: "Sparebanken Vest" }),
      txn(),
    );
    expect(result!.description).toBe("Sparebanken Vest - Fast Oppdrag");
  });
});

// ---------------------------------------------------------------------------
// Investment
// ---------------------------------------------------------------------------

describe("generateRelabel — investment", () => {
  it("uses fund name from merchantName", () => {
    const result = generateRelabel(
      parsed({ transactionType: "investment", merchantName: "KLP AksjeNorge" }),
      txn(),
    );
    expect(result).toEqual({
      merchantName: "KLP AksjeNorge",
      description: "Fund purchase - KLP AksjeNorge",
      notes: null,
    });
  });

  it("falls back to counterparty when merchantName is null", () => {
    const result = generateRelabel(
      parsed({
        transactionType: "investment",
        merchantName: null,
        counterparty: "DNB Norge Indeks",
      }),
      txn(),
    );
    expect(result!.description).toBe("Fund purchase - DNB Norge Indeks");
  });

  it("returns null when neither merchant nor counterparty", () => {
    expect(
      generateRelabel(
        parsed({ transactionType: "investment", merchantName: null }),
        txn(),
      ),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Internal transfer
// ---------------------------------------------------------------------------

describe("generateRelabel — internal_transfer", () => {
  it("uses counterparty with direction", () => {
    const result = generateRelabel(
      parsed({
        transactionType: "internal_transfer",
        merchantName: null,
        counterparty: "Savings Account",
        metadata: { direction: "debit" },
      }),
      txn(),
    );
    expect(result).toEqual({
      merchantName: null,
      description: "Transfer to Savings Account",
      notes: null,
    });
  });

  it("uses credit direction for incoming", () => {
    const result = generateRelabel(
      parsed({
        transactionType: "internal_transfer",
        merchantName: null,
        counterparty: "Checking",
        metadata: { direction: "credit" },
        purpose: "Monthly savings",
      }),
      txn(),
    );
    expect(result!.description).toBe("Transfer from Checking");
    expect(result!.notes).toBe("Monthly savings");
  });

  it("returns null when no counterparty or merchant", () => {
    expect(
      generateRelabel(
        parsed({ transactionType: "internal_transfer", merchantName: null }),
        txn(),
      ),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// P2P payment (Vipps)
// ---------------------------------------------------------------------------

describe("generateRelabel — p2p_payment", () => {
  it("formats as Vipps - counterparty", () => {
    const result = generateRelabel(
      parsed({
        transactionType: "p2p_payment",
        paymentChannel: "vipps",
        merchantName: null,
        counterparty: "Ola Nordmann",
      }),
      txn(),
    );
    expect(result).toEqual({
      merchantName: "Ola Nordmann",
      description: "Vipps - Ola Nordmann",
      notes: null,
    });
  });

  it("includes purpose as notes", () => {
    const result = generateRelabel(
      parsed({
        transactionType: "p2p_payment",
        merchantName: null,
        counterparty: "Kari",
        purpose: "Pizza money",
      }),
      txn(),
    );
    expect(result!.notes).toBe("Pizza money");
  });
});

// ---------------------------------------------------------------------------
// Bank transfer
// ---------------------------------------------------------------------------

describe("generateRelabel — bank_transfer", () => {
  it("formats as Transfer - counterparty", () => {
    const result = generateRelabel(
      parsed({
        transactionType: "bank_transfer",
        merchantName: null,
        counterparty: "Skatteetaten",
      }),
      txn(),
    );
    expect(result).toEqual({
      merchantName: "Skatteetaten",
      description: "Transfer - Skatteetaten",
      notes: null,
    });
  });
});

// ---------------------------------------------------------------------------
// Loan payment
// ---------------------------------------------------------------------------

describe("generateRelabel — loan_payment", () => {
  it("produces structured breakdown in notes", () => {
    const result = generateRelabel(
      parsed({
        transactionType: "loan_payment",
        merchantName: null,
        metadata: {
          principal: "5130.96",
          interest: "9994.04",
          fees: "65.00",
        },
      }),
      txn(),
    );
    expect(result).toEqual({
      merchantName: null,
      description: "Loan payment",
      notes: "Principal: 5130.96 kr, Interest: 9994.04 kr, Fees: 65.00 kr",
    });
  });

  it("works with partial breakdown", () => {
    const result = generateRelabel(
      parsed({
        transactionType: "loan_payment",
        merchantName: null,
        metadata: { principal: "5000" },
      }),
      txn(),
    );
    expect(result!.notes).toBe("Principal: 5000 kr");
  });

  it("works even without breakdown", () => {
    const result = generateRelabel(
      parsed({
        transactionType: "loan_payment",
        merchantName: null,
        metadata: {},
      }),
      txn(),
    );
    expect(result!.description).toBe("Loan payment");
    expect(result!.notes).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Salary
// ---------------------------------------------------------------------------

describe("generateRelabel — salary", () => {
  it("formats as Salary - employer", () => {
    const result = generateRelabel(
      parsed({
        transactionType: "salary",
        merchantName: "Acme Corp",
      }),
      txn(),
    );
    expect(result).toEqual({
      merchantName: "Acme Corp",
      description: "Salary - Acme Corp",
      notes: null,
    });
  });

  it("falls back to counterparty", () => {
    const result = generateRelabel(
      parsed({
        transactionType: "salary",
        merchantName: null,
        counterparty: "Oslo Kommune",
      }),
      txn(),
    );
    expect(result!.description).toBe("Salary - Oslo Kommune");
  });
});

// ---------------------------------------------------------------------------
// Fee
// ---------------------------------------------------------------------------

describe("generateRelabel — fee", () => {
  it("uses purpose when available", () => {
    const result = generateRelabel(
      parsed({
        transactionType: "fee",
        merchantName: null,
        purpose: "Monthly account maintenance",
      }),
      txn(),
    );
    expect(result).toEqual({
      merchantName: null,
      description: "Monthly account maintenance",
      notes: null,
    });
  });

  it("falls back to merchantName", () => {
    const result = generateRelabel(
      parsed({
        transactionType: "fee",
        merchantName: "Visa fee",
        purpose: null,
      }),
      txn(),
    );
    expect(result!.description).toBe("Visa fee");
  });

  it("returns null when neither purpose nor merchant", () => {
    expect(
      generateRelabel(
        parsed({ transactionType: "fee", merchantName: null, purpose: null }),
        txn(),
      ),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Types without templates (should return null)
// ---------------------------------------------------------------------------

describe("generateRelabel — no-template types", () => {
  it.each(["interest", "refund", "cash_withdrawal", "unknown"] as const)(
    "returns null for %s",
    (type) => {
      expect(
        generateRelabel(
          parsed({ transactionType: type, merchantName: "Something" }),
          txn(),
        ),
      ).toBeNull();
    },
  );
});

// ---------------------------------------------------------------------------
// Norwegian character preservation
// ---------------------------------------------------------------------------

describe("generateRelabel — Norwegian characters", () => {
  it("preserves Norwegian characters in relabeled text", () => {
    const result = generateRelabel(
      parsed({ merchantName: "Rødtvedt Sørøst Ås" }),
      txn(),
    );
    expect(result!.merchantName).toBe("Rødtvedt Sørøst Ås");
    expect(result!.description).toBe("Rødtvedt Sørøst Ås");
  });
});
