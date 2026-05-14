/**
 * Phase 3B — Auto-relabeling engine.
 *
 * `generateRelabel()` rewrites raw bank descriptions into clean, human-readable
 * text using parser-extracted structure. Relabeling only occurs when the parser
 * produced sufficient quality fields (merchant name present and non-truncated).
 *
 * Each transaction type has its own template (see the relabel-rules table in
 * 07-phase-3b-confidence-and-auto-labeling.md).
 */

import type { ParsedDescription, TransactionType } from "./parser/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of the metadata.autoLabel block stored on a transaction. */
export interface AutoLabelMetadata {
  appliedAt: string;
  source: "parser" | "merchant" | "rule" | "model";
  confidence: number;
  originalDescription: string;
  originalMerchantName: string | null;
  appliedDescription: string;
  appliedMerchantName: string | null;
  appliedCategoryId: string | null;
  undone: boolean;
}

/** Result from generateRelabel — only non-null when quality is sufficient. */
export interface RelabelResult {
  description: string;
  merchantName: string | null;
  notes: string | null;
}

/** Minimal transaction shape needed for relabel decisions. */
export interface RelabelTransactionInput {
  description: string;
  merchantName: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Shape of metadata.userEdits as read from the transaction. */
interface UserEdits {
  descriptionEdited?: boolean;
  merchantNameEdited?: boolean;
}

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

/**
 * Generate a human-readable relabel for a transaction from its parsed
 * description. Returns null when:
 * - The user has already edited the description or merchant name
 * - The parser didn't run or didn't extract useful data
 * - The merchant extraction is too short or clearly truncated
 *
 * When this function returns null for a suggestion path, the caller MUST clear
 * any stale suggestedDescription / suggestedMerchantName fields to avoid
 * surfacing outdated suggestions from a previous model run.
 */
export function generateRelabel(
  parsed: ParsedDescription | null,
  transaction: RelabelTransactionInput,
): RelabelResult | null {
  // Don't relabel if user has already edited
  const userEdits = (transaction.metadata as { userEdits?: UserEdits } | null)
    ?.userEdits;
  if (userEdits?.descriptionEdited) return null;
  if (userEdits?.merchantNameEdited) return null;

  // Don't relabel if parser didn't run or didn't extract useful data
  if (!parsed) return null;
  if (!parsed.merchantName && !parsed.transactionType) return null;

  // Explicit quality check: merchant extraction too short or clearly truncated
  if (parsed.merchantName && parsed.merchantName.trim().length < 2) return null;

  return relabelByType(parsed, transaction);
}

// ---------------------------------------------------------------------------
// Type-specific relabel templates
// ---------------------------------------------------------------------------

function relabelByType(
  parsed: ParsedDescription,
  transaction: RelabelTransactionInput,
): RelabelResult | null {
  const type = parsed.transactionType;

  switch (type) {
    case "card_purchase":
    case "online_purchase":
    case "vipps_purchase":
      return relabelMerchantOnly(parsed, transaction);

    case "foreign_purchase":
      return relabelForeignPurchase(parsed, transaction);

    case "direct_debit":
      return relabelWithSuffix(parsed, transaction, "Avtalegiro");

    case "e_invoice":
      return relabelWithSuffix(parsed, transaction, "Efaktura");

    case "standing_order":
      return relabelWithSuffix(parsed, transaction, "Fast Oppdrag");

    case "investment":
      return relabelInvestment(parsed, transaction);

    case "internal_transfer":
      return relabelInternalTransfer(parsed, transaction);

    case "p2p_payment":
      return relabelP2P(parsed, transaction);

    case "bank_transfer":
      return relabelBankTransfer(parsed, transaction);

    case "loan_payment":
      return relabelLoanPayment(parsed);

    case "salary":
      return relabelSalary(parsed, transaction);

    case "fee":
      return relabelFee(parsed, transaction);

    case "interest":
    case "refund":
    case "cash_withdrawal":
    case "unknown":
    default:
      // No relabel template — leave description as-is
      return null;
  }
}

// ---------------------------------------------------------------------------
// Template implementations
// ---------------------------------------------------------------------------

/** Card purchase / online / vipps: merchant becomes description. */
function relabelMerchantOnly(
  parsed: ParsedDescription,
  transaction: RelabelTransactionInput,
): RelabelResult | null {
  if (!parsed.merchantName) return null;
  return {
    merchantName: parsed.merchantName,
    description: parsed.merchantName,
    notes: null,
  };
}

/** Foreign purchase: merchant + original currency note. */
function relabelForeignPurchase(
  parsed: ParsedDescription,
  transaction: RelabelTransactionInput,
): RelabelResult | null {
  if (!parsed.merchantName) return null;
  const ccy = parsed.metadata?.originalCurrency;
  const amt = parsed.metadata?.originalAmount;
  const notes = ccy && amt ? `Original: ${ccy} ${amt}` : null;
  return {
    merchantName: parsed.merchantName,
    description: parsed.merchantName,
    notes,
  };
}

/** Direct debit / e-invoice / standing order: "Merchant - Suffix". */
function relabelWithSuffix(
  parsed: ParsedDescription,
  transaction: RelabelTransactionInput,
  suffix: string,
): RelabelResult | null {
  if (!parsed.merchantName) return null;
  return {
    merchantName: parsed.merchantName,
    description: `${parsed.merchantName} - ${suffix}`,
    notes: null,
  };
}

/** Investment: "Fund purchase - {fund name}". */
function relabelInvestment(
  parsed: ParsedDescription,
  transaction: RelabelTransactionInput,
): RelabelResult | null {
  const fund = parsed.merchantName ?? parsed.counterparty;
  if (!fund) return null;
  return {
    merchantName: fund,
    description: `Fund purchase - ${fund}`,
    notes: null,
  };
}

/** Internal transfer: "Transfer to/from {other account}". */
function relabelInternalTransfer(
  parsed: ParsedDescription,
  transaction: RelabelTransactionInput,
): RelabelResult | null {
  const other = parsed.counterparty ?? parsed.merchantName;
  if (!other) return null;
  const direction = parsed.metadata?.direction === "credit" ? "from" : "to";
  return {
    merchantName: null,
    description: `Transfer ${direction} ${other}`,
    notes: parsed.purpose ?? null,
  };
}

/** P2P (Vipps etc): "Vipps - {counterparty}". */
function relabelP2P(
  parsed: ParsedDescription,
  transaction: RelabelTransactionInput,
): RelabelResult | null {
  const counterparty = parsed.counterparty ?? parsed.merchantName;
  if (!counterparty) return null;
  return {
    merchantName: counterparty,
    description: `Vipps - ${counterparty}`,
    notes: parsed.purpose ?? null,
  };
}

/** Bank transfer: "Transfer - {counterparty}". */
function relabelBankTransfer(
  parsed: ParsedDescription,
  transaction: RelabelTransactionInput,
): RelabelResult | null {
  const counterparty = parsed.counterparty ?? parsed.merchantName;
  if (!counterparty) return null;
  return {
    merchantName: counterparty,
    description: `Transfer - ${counterparty}`,
    notes: parsed.purpose ?? null,
  };
}

/** Loan payment: structured breakdown. */
function relabelLoanPayment(
  parsed: ParsedDescription,
): RelabelResult | null {
  // Even without merchant, loan payments have useful structure
  const parts: string[] = [];
  if (parsed.metadata?.principal)
    parts.push(`Principal: ${parsed.metadata.principal} kr`);
  if (parsed.metadata?.interest)
    parts.push(`Interest: ${parsed.metadata.interest} kr`);
  if (parsed.metadata?.fees)
    parts.push(`Fees: ${parsed.metadata.fees} kr`);

  return {
    merchantName: null,
    description: "Loan payment",
    notes: parts.length > 0 ? parts.join(", ") : null,
  };
}

/** Salary: "Salary - {employer}". */
function relabelSalary(
  parsed: ParsedDescription,
  transaction: RelabelTransactionInput,
): RelabelResult | null {
  const employer =
    parsed.merchantName ?? parsed.counterparty;
  if (!employer) return null;
  return {
    merchantName: employer,
    description: `Salary - ${employer}`,
    notes: null,
  };
}

/** Fee: use parsed description. */
function relabelFee(
  parsed: ParsedDescription,
  transaction: RelabelTransactionInput,
): RelabelResult | null {
  // Fees may have a description but no merchant — still worth relabeling
  // if the parser extracted a meaningful purpose.
  const feeDescription = parsed.purpose ?? parsed.merchantName;
  if (!feeDescription) return null;
  return {
    merchantName: null,
    description: feeDescription,
    notes: null,
  };
}
