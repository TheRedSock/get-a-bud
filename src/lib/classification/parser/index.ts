/**
 * Description parser dispatcher.
 *
 * Source-aware: only processes descriptions from known providers and formats.
 * Manual and import transactions are skipped (return null).
 * Enable Banking transactions are only parsed if the country is Norway.
 */

import {
  parseCash,
  parseFee,
  parseGiro,
  parseInterest,
  parseKontoregulering,
  parseLoan,
  parseSalary,
  parseTransfer,
  parseTransferInnland,
  parseVarekjop,
  parseVarekjopKib,
  parseVisa,
  parseVisaFee,
} from "./norwegian";
import type {
  ParserResult,
  ProviderMeta,
  TransactionSource,
} from "./types";

/**
 * Parse a transaction description based on source and provider metadata.
 *
 * Returns a ParsedDescription with extracted fields, or null if the
 * description could not be parsed (unknown source, unknown format, or
 * manual/import transaction).
 */
export function parseDescription(
  description: string,
  source: TransactionSource,
  providerMeta?: ProviderMeta,
): ParserResult {
  // Never parse manual transactions or unknown imports
  if (source === "manual") return null;
  if (source === "import") return null;

  // Only parse Enable Banking from known Norwegian banks
  if (source === "enable_banking") {
    const country = providerMeta?.country;
    if (country !== "NO") return null;
  }

  if (!description || description.trim().length === 0) return null;

  // Try each parser in order of prefix specificity
  if (description.startsWith("Varekjøp Med Kib"))
    return parseVarekjopKib(description);
  if (description.startsWith("Varekjøp")) return parseVarekjop(description);
  if (/^[\d\s-]*Giro/.test(description)) return parseGiro(description);
  if (description.startsWith("Giro")) return parseGiro(description);
  if (description.startsWith("Kontoregulering"))
    return parseKontoregulering(description);
  if (description.startsWith("Lån")) return parseLoan(description);
  if (description.startsWith("Lønn")) return parseSalary(description);
  if (description.startsWith("Overføring Innland"))
    return parseTransferInnland(description);
  if (description.startsWith("Overførsel Innland"))
    return parseTransferInnland(description);
  if (description.startsWith("Overføring")) return parseTransfer(description);
  if (description.startsWith("Visa-Kostnad")) return parseVisaFee(description);
  if (description.startsWith("Visa")) return parseVisa(description);
  if (description.startsWith("Renter")) return parseInterest(description);
  if (description.startsWith("Prislagte")) return parseFee(description);
  if (description.startsWith("Omkostninger")) return parseFee(description);
  if (description.startsWith("Honorar fond")) return parseFee(description);
  if (description.startsWith("Uttak/innskudd")) return parseCash(description);
  if (description === "Opening balance adjustment") return null; // system row

  return null; // unrecognized — Tier 2 handles it
}
