import { normalizeMerchant } from "@/lib/finance/categorization";

export function parseDateByPattern(
  value: string | null | undefined,
  pattern: "DD.MM.YYYY" | "YYYY-MM-DD",
): string | null {
  if (!value) return null;
  const trimmed = value.trim();

  if (pattern === "YYYY-MM-DD") {
    return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
  }

  const match = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function parseLocalizedNumber(
  value: string | number | null | undefined,
): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const compact = value.replace(/\s/g, "");
  const normalized = compact.includes(",")
    ? compact.replace(/\./g, "").replace(",", ".")
    : compact;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toLocaleDisplayName(value: string, locale = "nb-NO") {
  return value
    .trim()
    .toLocaleLowerCase(locale)
    .replace(/(^|\s|-)(\p{L})/gu, (match) =>
      match.toLocaleUpperCase(locale),
    );
}

export function firstCommaSegment(value: string) {
  return value.split(",")[0]?.trim() || null;
}

export function normalizedMerchantOrNull(merchantName: string | null) {
  return merchantName ? normalizeMerchant(merchantName) : null;
}
