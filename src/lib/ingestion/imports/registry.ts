import { dnbCreditCardPeriodAdapter } from "@/lib/ingestion/imports/dnb/credit-card-period";
import type { ImportDraft, ImportFormatAdapter, ImportRow } from "./types";

export const importFormatAdapters: readonly ImportFormatAdapter[] = [
  dnbCreditCardPeriodAdapter,
] as const;

export function detectImportFormat(
  row: ImportRow,
  adapters: readonly ImportFormatAdapter[] = importFormatAdapters,
) {
  return adapters.find((adapter) => adapter.canParse(row)) ?? null;
}

export function normalizeImportRow(
  row: ImportRow,
  options: {
    formatId?: string;
    adapters?: readonly ImportFormatAdapter[];
  } = {},
): ImportDraft | null {
  const adapters = options.adapters ?? importFormatAdapters;
  const adapter = options.formatId
    ? adapters.find((candidate) => candidate.id === options.formatId)
    : detectImportFormat(row, adapters);

  if (!adapter || !adapter.canParse(row)) return null;
  return adapter.normalizeRow(row);
}
