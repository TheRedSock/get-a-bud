/**
 * Feature extraction for the Tier 2 statistical classifier.
 *
 * Produces a flat array of namespace-prefixed tokens from whatever transaction
 * fields are available. Missing fields are simply omitted — never zero-filled
 * — so that Naive Bayes treats absent features as neutral signal.
 *
 * Token namespaces prevent collisions: the word "visa" in a description
 * (`w:visa`) is distinct from a payment channel (`chan:visa`).
 */

import { AggressiveTokenizerNo, PorterStemmerNo } from "natural";

import { normalizeMerchant } from "@/lib/finance/categorization";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface TransactionFeatureInput {
  description?: string | null;
  merchantName?: string | null;
  normalizedMerchantName?: string | null;
  amount?: string | null;
  date?: string | null;
  transactionType?: string | null;
  paymentChannel?: string | null;
  creditDebitIndicator?: string | null;
  originalCurrency?: string | null;
}

/**
 * Extract feature tokens from a transaction for use with the Naive Bayes
 * classifier. Every field is optional; missing fields produce no tokens.
 */
export function extractFeatures(txn: TransactionFeatureInput): string[] {
  const tokens: string[] = [];

  // --- Text features (from whatever text is available) ---

  const text = [txn.normalizedMerchantName, txn.merchantName, txn.description]
    .filter(Boolean)
    .join(" ");

  if (text.trim()) {
    const normalized = normalizeMerchant(text);
    const words = tokenize(normalized);
    const stemmed = words.map(stemNorwegian);

    // Unigrams
    for (const s of stemmed) {
      tokens.push(`w:${s}`);
    }

    // Bigrams (adjacent word pairs)
    for (let i = 0; i < stemmed.length - 1; i++) {
      tokens.push(`b:${stemmed[i]}_${stemmed[i + 1]}`);
    }
  }

  // --- Structured features (all optional) ---

  if (txn.transactionType) {
    tokens.push(`type:${txn.transactionType}`);
  }

  if (txn.paymentChannel) {
    tokens.push(`chan:${txn.paymentChannel}`);
  }

  if (txn.amount) {
    const amt = Math.abs(Number(txn.amount));
    if (Number.isFinite(amt)) {
      tokens.push(`amt:${amountToBucket(amt)}`);
    }
  }

  if (txn.date) {
    const d = new Date(txn.date);
    if (!isNaN(d.getTime())) {
      tokens.push(`dow:${d.getDay()}`);

      const dom = d.getDate();
      if (dom <= 10) tokens.push("dom:start");
      else if (dom <= 20) tokens.push("dom:mid");
      else tokens.push("dom:end");
    }
  }

  if (txn.creditDebitIndicator) {
    tokens.push(`dir:${txn.creditDebitIndicator}`);
  }

  if (txn.originalCurrency) {
    tokens.push(`cur:${txn.originalCurrency}`);
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// Internals (exported for testing)
// ---------------------------------------------------------------------------

const norwegianTokenizer = new AggressiveTokenizerNo();

/** Tokenize using `natural`'s Norwegian-aware aggressive tokenizer. */
export function tokenize(text: string): string[] {
  return norwegianTokenizer.tokenize(text) ?? [];
}

/** Stem a single word using the Norwegian Snowball (Porter) stemmer. */
export function stemNorwegian(word: string): string {
  return PorterStemmerNo.stem(word);
}

/**
 * Map an absolute amount into a coarse bucket for the classifier.
 * Buckets are intentionally broad — the classifier learns which buckets
 * correlate with which categories, not exact amounts.
 */
export function amountToBucket(amount: number): string {
  if (amount < 50) return "0_50";
  if (amount < 200) return "50_200";
  if (amount < 500) return "200_500";
  if (amount < 1000) return "500_1k";
  if (amount < 5000) return "1k_5k";
  return "5k_plus";
}
