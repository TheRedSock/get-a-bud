/**
 * Canonical money module.
 *
 * All money in this application is stored and computed as integer minor units
 * (cents). This module provides the single source of truth for:
 *
 * - Parsing user/provider input into cents (boundary conversion).
 * - Formatting cents for display (UI boundary only).
 * - Arithmetic helpers that keep operations in integer space.
 *
 * Rules:
 * - Never use JS float math for parsing decimal strings into cents.
 * - Preserve negative values.
 * - Handle localized decimal separators (comma and dot).
 * - Exchange rates, confidence scores, and interest rates are NOT money and
 *   should not use this module.
 */

/** Formatter cache keyed by currency code. */
const formatterCache = new Map<string, Intl.NumberFormat>();

/**
 * Parse a localized decimal string (user input or provider value) into integer
 * cents. Handles both dot and comma as decimal separators, ignores thousands
 * separators (spaces, dots when comma is decimal, commas when dot is decimal).
 *
 * Returns integer cents. Throws if the input cannot be parsed.
 *
 * Examples:
 *   "1234.56"   → 123456
 *   "1 234,56"  → 123456
 *   "-99.90"    → -9990
 *   "1.234,56"  → 123456  (dot as thousands sep, comma as decimal)
 *   "0.5"       → 50
 *   "100"       → 10000
 */
export function parseMoneyToCents(input: string | number): number {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) {
      throw new Error(`Invalid money value: ${String(input)}`);
    }
    // If given a number, treat it as major units (e.g., 12.34 → 1234 cents)
    return decimalNumberToCents(input);
  }

  const trimmed = input.trim();
  if (trimmed === "" || trimmed === "-") {
    throw new Error(`Invalid money value: "${input}"`);
  }

  // Determine the decimal separator by examining the string.
  // Strategy: the last separator character (dot or comma) that has exactly
  // 1-2 digits after it is the decimal separator. Everything else is a
  // thousands separator or integer part.
  const cleaned = trimmed.replace(/\s/g, "");

  // Check for the pattern: has both dots and commas
  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");

  let normalized: string;

  if (lastComma > lastDot) {
    // Comma is the decimal separator (European style: "1.234,56" or "1234,56")
    // Remove dots (thousands separators), replace comma with dot
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    // Dot is the decimal separator (US/UK style: "1,234.56" or "1234.56")
    // Remove commas (thousands separators)
    normalized = cleaned.replace(/,/g, "");
  } else {
    // No separators, or only one type
    // If there's exactly one comma and it looks like a decimal separator
    if (lastComma !== -1) {
      const afterComma = cleaned.slice(lastComma + 1);
      if (afterComma.length <= 2 && /^\d+$/.test(afterComma)) {
        normalized = cleaned.replace(",", ".");
      } else {
        // Comma is thousands separator
        normalized = cleaned.replace(/,/g, "");
      }
    } else {
      normalized = cleaned;
    }
  }

  // Validate the normalized string is a valid number
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    throw new Error(`Invalid money value: "${input}"`);
  }

  return decimalStringToCents(normalized);
}

/**
 * Convert a normalized decimal string (using dot as decimal separator, no
 * thousands separators) into integer cents. Uses string manipulation to avoid
 * float precision issues.
 *
 * The input must have at most 2 decimal places. If more decimal places are
 * provided, the value is rounded to the nearest cent using banker's rounding.
 *
 * Examples:
 *   "1234.56" → 123456
 *   "-99.90"  → -9990
 *   "100"     → 10000
 *   "0.5"     → 50
 */
export function decimalStringToCents(decimal: string): number {
  const trimmed = decimal.trim();

  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid decimal string for cents conversion: "${decimal}"`);
  }

  const isNegative = trimmed.startsWith("-");
  const absolute = isNegative ? trimmed.slice(1) : trimmed;

  const [integerPart, fractionalPart = ""] = absolute.split(".");

  // Pad or truncate fractional part to exactly 2 digits
  let centsFraction: string;
  if (fractionalPart.length <= 2) {
    centsFraction = fractionalPart.padEnd(2, "0");
  } else {
    // More than 2 decimal places: round to nearest cent
    const thirdDigit = Number(fractionalPart[2]);
    let twoDigitValue = Number(fractionalPart.slice(0, 2));

    if (thirdDigit > 5) {
      twoDigitValue += 1;
    } else if (thirdDigit === 5) {
      // Banker's rounding: round to even
      const remaining = fractionalPart.slice(3);
      if (remaining.length > 0 && Number(remaining) > 0) {
        // Not exactly half — round up
        twoDigitValue += 1;
      } else {
        // Exactly half — round to even
        if (twoDigitValue % 2 !== 0) {
          twoDigitValue += 1;
        }
      }
    }
    // If rounding pushed us to 100, carry into integer part
    if (twoDigitValue >= 100) {
      const intValue = Number(integerPart) + 1;
      centsFraction = "00";
      const result = intValue * 100;
      return isNegative ? -result : result;
    }
    centsFraction = String(twoDigitValue).padStart(2, "0");
  }

  const centsValue = Number(integerPart) * 100 + Number(centsFraction);

  if (!Number.isSafeInteger(isNegative ? -centsValue : centsValue)) {
    throw new Error(
      `Money value exceeds safe integer range: "${decimal}"`,
    );
  }

  // Avoid returning -0
  if (centsValue === 0) return 0;

  return isNegative ? -centsValue : centsValue;
}

/**
 * Convert a JS number representing major units to integer cents.
 * Uses string conversion to avoid float multiplication precision issues.
 */
function decimalNumberToCents(value: number): number {
  // Convert to string to avoid float multiplication issues
  // e.g., 0.1 + 0.2 !== 0.3 in float, but "0.30" string works fine
  const str = value.toFixed(2);
  return decimalStringToCents(str);
}

/**
 * Format integer cents for display using locale-aware currency formatting.
 *
 * This is the ONLY place money should be formatted for the UI.
 */
export function formatCents(
  cents: number,
  currency = "NOK",
  locale = "nb-NO",
): string {
  const key = `${locale}:${currency}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    });
    formatterCache.set(key, formatter);
  }
  return formatter.format(cents / 100);
}

/**
 * Format integer cents for display with decimal places (e.g., for editing).
 */
export function formatCentsDecimal(
  cents: number,
  currency = "NOK",
  locale = "nb-NO",
): string {
  const key = `${locale}:${currency}:dec`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    });
    formatterCache.set(key, formatter);
  }
  return formatter.format(cents / 100);
}

/**
 * Convert cents to a plain decimal string suitable for form input fields.
 * Example: 123456 → "1234.56", -9990 → "-99.90"
 */
export function centsToDecimalString(cents: number): string {
  const isNegative = cents < 0;
  const absolute = Math.abs(cents);
  const integerPart = Math.floor(absolute / 100);
  const fractionalPart = absolute % 100;
  const result = `${integerPart}.${String(fractionalPart).padStart(2, "0")}`;
  return isNegative ? `-${result}` : result;
}

/**
 * Sum multiple cent values. All inputs must be integers.
 */
export function addCents(...values: number[]): number {
  let sum = 0;
  for (const v of values) {
    sum += v;
  }
  if (!Number.isSafeInteger(sum)) {
    throw new Error("Cents sum exceeds safe integer range");
  }
  return sum;
}

/**
 * Negate a cent value.
 */
export function negateCents(cents: number): number {
  return cents === 0 ? 0 : -cents;
}

/**
 * Check if a cent value is zero.
 */
export function isZeroCents(cents: number): boolean {
  return cents === 0;
}

/**
 * Absolute value of cents.
 */
export function absCents(cents: number): number {
  return Math.abs(cents);
}

/**
 * Zod preprocessor for money input fields. Transforms a user-entered string
 * (potentially with locale formatting) into integer cents for server-side use.
 *
 * Usage in Zod schemas:
 *   amount: z.preprocess(moneyPreprocessor, z.number().int())
 */
export function moneyPreprocessor(val: unknown): number | undefined {
  if (val === undefined || val === null || val === "") return undefined;
  if (typeof val === "number") return parseMoneyToCents(val);
  if (typeof val === "string") return parseMoneyToCents(val);
  return undefined;
}

/**
 * Create a Zod preprocess chain for a required money field.
 * Returns cents as an integer.
 */
export { moneyPreprocessor as moneyInput };
