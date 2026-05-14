/**
 * Norwegian bank transaction description parsers.
 *
 * Each parser is a pure function that extracts structured fields from a
 * description string matching a known Norwegian bank format. Returns null
 * if the description doesn't match the expected pattern.
 *
 * Format families:
 *   1. Varekjøp (card purchase)
 *   2. Giro (invoices, direct debits, investments)
 *   3. Kontoregulering (account regulation / internal transfer)
 *   4. Lån (loan payment)
 *   5. Lønn (salary)
 *   6. Overføring Innland (domestic transfer)
 *   7. Overføring (transfer, no "Innland")
 *   8. Visa (card transactions — 8 sub-formats)
 *   9. Miscellaneous (interest, fees, cash withdrawal, etc.)
 */

import type { ParsedDescription } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Split on ", " (comma-space) — the standard Norwegian description delimiter.
 * Trims each segment.
 */
function splitSegments(desc: string): string[] {
  return desc.split(", ").map((s) => s.trim());
}

/**
 * Parse Norwegian decimal format: comma as decimal sep, period as thousands sep.
 * "21,99" -> "21.99", "1.234,56" -> "1234.56"
 */
export function parseNorwegianDecimal(value: string): string {
  return value.replace(/\./g, "").replace(",", ".").trim();
}

// ---------------------------------------------------------------------------
// Family 1: Varekjøp (card purchase)
// ---------------------------------------------------------------------------

/**
 * Standard Varekjøp:
 *   Varekjøp, Kl. {HH.MM} Versjon 1 Aut. {auth}, {merchant} {address} {city}
 */
export function parseVarekjop(desc: string): ParsedDescription | null {
  const segments = splitSegments(desc);
  if (segments.length < 2) return null;

  // Extract time and auth from the middle segment(s)
  let time: string | null = null;
  let authCode: string | null = null;
  let merchantSegment: string | null = null;

  // Find the Kl. segment and auth segment
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const klMatch = seg.match(/Kl\.\s*(\d{2}\.\d{2})/);
    if (klMatch) time = klMatch[1];
    const autMatch = seg.match(/Aut\.\s*(\d+)/);
    if (autMatch) authCode = autMatch[1];
  }

  // Merchant is the last segment (after the auth segment)
  merchantSegment = segments[segments.length - 1];

  // If the last segment contains "Aut." it's not actually the merchant
  // (happens when there's no separate merchant segment)
  if (merchantSegment.includes("Aut.") || merchantSegment.startsWith("Varekjøp")) {
    merchantSegment = null;
  }

  return {
    transactionType: "card_purchase",
    paymentChannel: "debit_card",
    merchantName: merchantSegment,
    merchantAddress: null,
    counterparty: null,
    purpose: null,
    metadata: {
      time,
      authCode,
    },
  };
}

/**
 * Varekjøp Med Kib variant:
 *   Varekjøp Med Kib, Ark.Ref *{ref} Dato {date}, Kl. {HH.MM} Versjon 1 Aut. {auth}, {merchant}
 */
export function parseVarekjopKib(desc: string): ParsedDescription | null {
  const segments = splitSegments(desc);
  if (segments.length < 3) return null;

  let time: string | null = null;
  let authCode: string | null = null;
  let refNumber: string | null = null;

  for (const seg of segments) {
    const klMatch = seg.match(/Kl\.\s*(\d{2}\.\d{2})/);
    if (klMatch) time = klMatch[1];
    const autMatch = seg.match(/Aut\.\s*(\d+)/);
    if (autMatch) authCode = autMatch[1];
    const refMatch = seg.match(/Ark\.Ref\s*\*(\d+)/);
    if (refMatch) refNumber = refMatch[1];
  }

  // Merchant is the last segment
  const merchantSegment = segments[segments.length - 1];
  const merchant =
    merchantSegment.includes("Aut.") || merchantSegment.startsWith("Varekjøp")
      ? null
      : merchantSegment;

  return {
    transactionType: "card_purchase",
    paymentChannel: "debit_card",
    merchantName: merchant,
    merchantAddress: null,
    counterparty: null,
    purpose: null,
    metadata: {
      time,
      authCode,
      refNumber,
    },
  };
}

// ---------------------------------------------------------------------------
// Family 2: Giro (invoices and direct debits)
// ---------------------------------------------------------------------------

const GIRO_TYPE_MAP: Record<string, ParsedDescription["transactionType"]> = {
  avtalegiro: "direct_debit",
  efaktura: "e_invoice",
  fondshandel: "investment",
  "fast oppdrag": "standing_order",
  "mobil betaling": "p2p_payment",
};

/**
 * Giro formats:
 *   {ref_number} Giro, {creditor}, {type} {CREDITOR_UPPERCASE}
 *   Giro, {creditor}, {type}
 *   Giro  {number}, {creditor}, {type}
 */
export function parseGiro(desc: string): ParsedDescription | null {
  // Strip leading reference number (digits/hyphens/spaces before "Giro")
  const giroIndex = desc.search(/Giro/i);
  if (giroIndex < 0) return null;

  const afterGiro = desc.slice(giroIndex);
  // Remove "Giro" prefix and optional number after it
  const stripped = afterGiro.replace(/^Giro\s*\d*/, "").replace(/^,\s*/, "");

  const segments = splitSegments(stripped);
  if (segments.length < 1) return null;

  // Creditor name is the first segment
  const creditorName = segments[0] || null;

  // Payment type keyword is in the second segment if present
  let transactionType: ParsedDescription["transactionType"] = "direct_debit";
  let detail: string | null = null;

  if (segments.length >= 2) {
    const typeSegment = segments[1].toLowerCase();
    for (const [keyword, type] of Object.entries(GIRO_TYPE_MAP)) {
      if (typeSegment.includes(keyword)) {
        transactionType = type;
        break;
      }
    }

    // Additional detail from segment 3+
    if (segments.length >= 3) {
      // Filter out trailing all-uppercase creditor name repetition
      const remaining = segments.slice(2);
      const details = remaining.filter((s) => s !== s.toUpperCase() || s.length <= 3);
      if (details.length > 0) {
        detail = details.join(", ");
      }
    }
  }

  return {
    transactionType,
    paymentChannel: "giro",
    merchantName: creditorName,
    merchantAddress: null,
    counterparty: null,
    purpose: detail,
    metadata: {},
  };
}

// ---------------------------------------------------------------------------
// Family 3: Kontoregulering (account regulation)
// ---------------------------------------------------------------------------

export function parseKontoregulering(desc: string): ParsedDescription | null {
  const segments = splitSegments(desc);
  if (segments.length < 2) {
    return {
      transactionType: "internal_transfer",
      paymentChannel: "internal",
      merchantName: null,
      merchantAddress: null,
      counterparty: null,
      purpose: desc,
      metadata: {},
    };
  }

  const afterPrefix = segments.slice(1).join(", ");
  const lower = afterPrefix.toLowerCase();

  if (lower.includes("mellom egne konti")) {
    return {
      transactionType: "internal_transfer",
      paymentChannel: "internal",
      merchantName: null,
      merchantAddress: null,
      counterparty: null,
      purpose: "Overføring Mellom Egne Konti",
      metadata: {},
    };
  }

  if (lower.includes("mobil overføring")) {
    return {
      transactionType: "bank_transfer",
      paymentChannel: "internal",
      merchantName: null,
      merchantAddress: null,
      counterparty: null,
      purpose: "Mobil Overføring",
      metadata: {},
    };
  }

  // Free-text description — still an internal transfer
  return {
    transactionType: "internal_transfer",
    paymentChannel: "internal",
    merchantName: null,
    merchantAddress: null,
    counterparty: segments.length > 2 ? segments[1] : null,
    purpose: afterPrefix,
    metadata: {},
  };
}

// ---------------------------------------------------------------------------
// Family 4: Lån (loan payment)
// ---------------------------------------------------------------------------

export function parseLoan(desc: string): ParsedDescription | null {
  const match = desc.match(
    /Lån,\s*Lån\s*([\d.]+),\s*Avdrag\s+Kr\s+([\d.,]+),\s*Renter\s+Kr\s+([\d.,]+),\s*Omk\.\s*Kr\s+([\d.,]+)/i,
  );

  if (match) {
    return {
      transactionType: "loan_payment",
      paymentChannel: "loan",
      merchantName: null,
      merchantAddress: null,
      counterparty: null,
      purpose: "Loan payment",
      metadata: {
        loanAccount: match[1],
        principal: parseNorwegianDecimal(match[2]),
        interest: parseNorwegianDecimal(match[3]),
        fees: parseNorwegianDecimal(match[4]),
      },
    };
  }

  // Simpler loan format: "Lån, ..."
  if (desc.startsWith("Lån")) {
    return {
      transactionType: "loan_payment",
      paymentChannel: "loan",
      merchantName: null,
      merchantAddress: null,
      counterparty: null,
      purpose: desc.replace(/^Lån,?\s*/, ""),
      metadata: {},
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Family 5: Lønn (salary)
// ---------------------------------------------------------------------------

export function parseSalary(desc: string): ParsedDescription | null {
  const employer = desc.replace(/^Lønn,\s*/, "").trim();
  return {
    transactionType: "salary",
    paymentChannel: "salary",
    merchantName: employer || null,
    merchantAddress: null,
    counterparty: employer || null,
    purpose: null,
    metadata: {},
  };
}

// ---------------------------------------------------------------------------
// Family 6: Overføring Innland (domestic transfer)
// ---------------------------------------------------------------------------

export function parseTransferInnland(desc: string): ParsedDescription | null {
  // Strip the prefix (handles both "Overføring" and "Overførsel" variants)
  const stripped = desc
    .replace(/^Overføring Innland,\s*/, "")
    .replace(/^Overførsel Innland,\s*/, "");

  const segments = splitSegments(stripped);
  if (segments.length < 1) return null;

  // Detect Vipps involvement
  const hasVipps = desc.toLowerCase().includes("tpp: vipps");
  const hasTax = desc.toLowerCase().includes("skatteetaten");
  const hasRefund =
    desc.toLowerCase().includes("kreditering") &&
    desc.toLowerCase().includes("ark.ref");

  // Detect Mobilbank / Nettbank / Ref patterns where the name is in a later segment
  const isMobilbank = segments[0].toLowerCase().startsWith("mobilbank dato");
  const isNettbank = segments[0].toLowerCase().startsWith("nettbank overføring");
  const isRef = segments[0].toLowerCase().startsWith("ref:");
  const isTil = segments[0].toLowerCase().startsWith("til :");
  const isArkRef = segments[0].toLowerCase().startsWith("ark.ref");

  let counterparty: string | null = null;
  let purpose: string | null = null;

  if (isMobilbank || isNettbank || isRef || isArkRef) {
    // Name is in the second or later segment
    counterparty = segments.length >= 2 ? segments[segments.length - 1] : null;
    purpose = segments[0];
  } else if (isTil) {
    counterparty = null;
    purpose = segments.join(", ");
  } else {
    // Standard: first segment is the counterparty name
    counterparty = segments[0];

    // Purpose is in segments between name and Tpp: if Vipps
    if (hasVipps) {
      const tppIdx = segments.findIndex((s) =>
        s.toLowerCase().startsWith("tpp:"),
      );
      if (tppIdx > 1) {
        purpose = segments.slice(1, tppIdx).join(", ");
      } else if (segments.length > 2) {
        // Message after Tpp
        purpose = segments[segments.length - 1];
      }
    } else if (segments.length > 1) {
      purpose = segments.slice(1).join(", ");
    }
  }

  let transactionType: ParsedDescription["transactionType"] = "bank_transfer";
  let paymentChannel: ParsedDescription["paymentChannel"] = "bank_transfer";

  if (hasVipps) {
    transactionType = "p2p_payment";
    paymentChannel = "vipps";
  } else if (hasTax) {
    transactionType = "bank_transfer";
  } else if (hasRefund) {
    transactionType = "refund";
  }

  return {
    transactionType,
    paymentChannel,
    merchantName: null,
    merchantAddress: null,
    counterparty,
    purpose,
    metadata: {},
  };
}

// ---------------------------------------------------------------------------
// Family 7: Overføring (transfer, no "Innland")
// ---------------------------------------------------------------------------

export function parseTransfer(desc: string): ParsedDescription | null {
  // Same logic as Innland, just strip a different prefix
  const stripped = desc.replace(/^Overføring,?\s*/, "");
  const segments = splitSegments(stripped);
  if (segments.length < 1) return null;

  const hasVipps = desc.toLowerCase().includes("tpp: vipps");

  let counterparty: string | null = segments[0] || null;
  let purpose: string | null = null;

  if (segments.length > 1) {
    purpose = segments.slice(1).join(", ");
  }

  let transactionType: ParsedDescription["transactionType"] = "bank_transfer";
  let paymentChannel: ParsedDescription["paymentChannel"] = "bank_transfer";

  if (hasVipps) {
    transactionType = "p2p_payment";
    paymentChannel = "vipps";
  }

  return {
    transactionType,
    paymentChannel,
    merchantName: null,
    merchantAddress: null,
    counterparty,
    purpose,
    metadata: {},
  };
}

// ---------------------------------------------------------------------------
// Family 8: Visa (card transactions — multiple sub-formats)
// ---------------------------------------------------------------------------

/**
 * 8a: Visa foreign currency
 *   Visa, {CCY} {amount} {merchant}, Valutakurs: {rate}
 */
export function parseVisaForeign(desc: string): ParsedDescription | null {
  const match = desc.match(
    /^Visa,\s+([A-Za-z]{3})\s+([\d.,]+)\s+(.+?),\s+Valutakurs:\s+([\d.,\s]+)$/i,
  );
  if (!match) return null;

  return {
    transactionType: "foreign_purchase",
    paymentChannel: "visa",
    merchantName: match[3].trim(),
    merchantAddress: null,
    counterparty: null,
    purpose: null,
    metadata: {
      originalCurrency: match[1].toUpperCase(),
      originalAmount: match[2],
      exchangeRate: match[4].trim(),
    },
  };
}

/**
 * 8b: Visa NOK online purchase
 *   Visa, Nok {amount} {merchant}
 */
export function parseVisaNok(desc: string): ParsedDescription | null {
  const match = desc.match(/^Visa,\s+Nok\s+([\d.,]+)\s+(.+)$/i);
  if (!match) return null;

  return {
    transactionType: "online_purchase",
    paymentChannel: "visa",
    merchantName: match[2].trim(),
    merchantAddress: null,
    counterparty: null,
    purpose: null,
    metadata: {
      nokAmount: match[1],
    },
  };
}

/**
 * 8c: Visa Vipps purchase
 *   Visa, Vipps:{merchant}
 */
export function parseVisaVipps(desc: string): ParsedDescription | null {
  const match = desc.match(/^Visa,\s+Vipps:(.+)$/i);
  if (!match) return null;

  return {
    transactionType: "vipps_purchase",
    paymentChannel: "vipps",
    merchantName: match[1].trim(),
    merchantAddress: null,
    counterparty: null,
    purpose: null,
    metadata: {},
  };
}

/**
 * 8d: Visa PayPal purchase
 *   Visa, Paypal :{merchant}
 *   Visa, Pp:{merchant}
 */
export function parseVisaPaypal(desc: string): ParsedDescription | null {
  const match = desc.match(/^Visa,\s+(?:Paypal\s*:|Pp:)\s*(.+)$/i);
  if (!match) return null;

  return {
    transactionType: "online_purchase",
    paymentChannel: "paypal",
    merchantName: match[1].trim(),
    merchantAddress: null,
    counterparty: null,
    purpose: null,
    metadata: {},
  };
}

/**
 * 8e: Visa Zettle purchase
 *   Visa, Zettle_:{merchant}
 */
export function parseVisaZettle(desc: string): ParsedDescription | null {
  const match = desc.match(/^Visa,\s+Zettle_:(.+)$/i);
  if (!match) return null;

  return {
    transactionType: "card_purchase",
    paymentChannel: "zettle",
    merchantName: match[1].trim(),
    merchantAddress: null,
    counterparty: null,
    purpose: null,
    metadata: {},
  };
}

/**
 * 8f: Visa date-reference format
 *   Visa, {d/m}_{ref}_{merchant}
 */
export function parseVisaDateRef(desc: string): ParsedDescription | null {
  const match = desc.match(/^Visa,\s+\d+\/\d+_\d+_(.+)$/i);
  if (!match) return null;

  return {
    transactionType: "card_purchase",
    paymentChannel: "visa",
    merchantName: match[1].trim(),
    merchantAddress: null,
    counterparty: null,
    purpose: null,
    metadata: {},
  };
}

/**
 * 8g: Visa simple merchant (fallback)
 *   Visa, {merchant}
 */
export function parseVisaSimple(desc: string): ParsedDescription | null {
  const match = desc.match(/^Visa,\s+(.+)$/i);
  if (!match) return null;

  return {
    transactionType: "card_purchase",
    paymentChannel: "visa",
    merchantName: match[1].trim(),
    merchantAddress: null,
    counterparty: null,
    purpose: null,
    metadata: {},
  };
}

/**
 * Main Visa dispatcher — tries sub-formats in order of specificity.
 */
export function parseVisa(desc: string): ParsedDescription | null {
  // 8a: Foreign currency (has "Valutakurs:")
  if (/valutakurs:/i.test(desc)) {
    const result = parseVisaForeign(desc);
    if (result) return result;
  }

  // 8c: Vipps
  if (/visa,\s+vipps:/i.test(desc)) {
    return parseVisaVipps(desc);
  }

  // 8d: PayPal
  if (/visa,\s+(?:paypal\s*:|pp:)/i.test(desc)) {
    return parseVisaPaypal(desc);
  }

  // 8e: Zettle
  if (/visa,\s+zettle_:/i.test(desc)) {
    return parseVisaZettle(desc);
  }

  // 8b: NOK amount
  if (/visa,\s+nok\s+/i.test(desc)) {
    const result = parseVisaNok(desc);
    if (result) return result;
  }

  // 8f: Date-reference
  if (/visa,\s+\d+\/\d+_\d+_/i.test(desc)) {
    const result = parseVisaDateRef(desc);
    if (result) return result;
  }

  // 8g: Simple merchant (fallback)
  return parseVisaSimple(desc);
}

/**
 * 8h: Visa-Kostnad (card fee)
 *   Visa-Kostnad, {description}
 */
export function parseVisaFee(desc: string): ParsedDescription | null {
  const detail = desc.replace(/^Visa-Kostnad,?\s*/, "").trim();
  return {
    transactionType: "fee",
    paymentChannel: "visa",
    merchantName: null,
    merchantAddress: null,
    counterparty: null,
    purpose: detail || null,
    metadata: {},
  };
}

// ---------------------------------------------------------------------------
// Family 9: Miscellaneous
// ---------------------------------------------------------------------------

export function parseInterest(desc: string): ParsedDescription | null {
  const detail = desc.replace(/^Renter,?\s*/, "").trim();
  return {
    transactionType: "interest",
    paymentChannel: "unknown",
    merchantName: null,
    merchantAddress: null,
    counterparty: null,
    purpose: detail || null,
    metadata: {},
  };
}

export function parseFee(desc: string): ParsedDescription | null {
  // Handles: Prislagte Tjenester, Omkostninger, Honorar fond
  const detail = desc
    .replace(/^Prislagte Tjenester,?\s*/, "")
    .replace(/^Omkostninger,?\s*/, "")
    .replace(/^Honorar fond,?\s*/, "")
    .trim();

  return {
    transactionType: "fee",
    paymentChannel: "unknown",
    merchantName: null,
    merchantAddress: null,
    counterparty: null,
    purpose: detail || desc,
    metadata: {},
  };
}

export function parseCash(desc: string): ParsedDescription | null {
  const detail = desc.replace(/^Uttak\/innskudd,?\s*/, "").trim();
  return {
    transactionType: "cash_withdrawal",
    paymentChannel: "unknown",
    merchantName: null,
    merchantAddress: null,
    counterparty: null,
    purpose: detail || null,
    metadata: {},
  };
}
