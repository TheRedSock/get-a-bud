/**
 * Types for the transaction description parser system.
 *
 * The parser extracts structured fields from bank transaction descriptions.
 * It is source-aware: only known formats from known providers are parsed.
 * Unknown sources fall through to Tier 2 statistical classification.
 */

/** Known transaction types extracted by the parser. */
export type TransactionType =
  | "card_purchase"
  | "direct_debit"
  | "e_invoice"
  | "standing_order"
  | "investment"
  | "internal_transfer"
  | "p2p_payment"
  | "bank_transfer"
  | "loan_payment"
  | "salary"
  | "interest"
  | "refund"
  | "foreign_purchase"
  | "online_purchase"
  | "vipps_purchase"
  | "fee"
  | "cash_withdrawal"
  | "unknown";

/** Known payment channels. */
export type PaymentChannel =
  | "visa"
  | "debit_card"
  | "vipps"
  | "giro"
  | "paypal"
  | "zettle"
  | "klarna"
  | "internal"
  | "bank_transfer"
  | "credit_card"
  | "loan"
  | "salary"
  | "unknown";

/** Structured output from a successful parse. */
export interface ParsedDescription {
  transactionType: TransactionType;
  paymentChannel: PaymentChannel;
  merchantName: string | null;
  merchantAddress: string | null;
  counterparty: string | null;
  purpose: string | null;
  metadata: Record<string, string | number | null>;
}

/**
 * Parser result: a ParsedDescription if the format was recognized,
 * or null if the description could not be parsed.
 */
export type ParserResult = ParsedDescription | null;

/** Transaction source for dispatch decisions. */
export type TransactionSource = "manual" | "enable_banking" | "import";

/** Provider metadata used for source-aware dispatch. */
export interface ProviderMeta {
  provider?: string;
  country?: string;
}
