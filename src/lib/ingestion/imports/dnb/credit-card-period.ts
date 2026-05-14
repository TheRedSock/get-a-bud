import {
  firstCommaSegment,
  normalizedMerchantOrNull,
  parseDateByPattern,
  parseLocalizedNumber,
  toLocaleDisplayName,
} from "@/lib/ingestion/imports/normalization";
import type {
  ImportDraft,
  ImportFormatAdapter,
  ImportRow,
  ImportRowValue,
} from "@/lib/ingestion/imports/types";

export const DNB_CREDIT_CARD_PERIOD_FORMAT = "dnb_credit_card_period_export";

export interface DnbCreditCardPeriodRow extends ImportRow {
  Dato?: string;
  "Beløpet gjelder"?: string;
  Valuta?: string;
  Kurs?: string;
  Inn?: ImportRowValue;
  Ut?: ImportRowValue;
}

const REQUIRED_COLUMNS = ["Dato", "Beløpet gjelder"] as const;

function isPriorStatementBalance(description: string) {
  return /^skyldig beløp fra forrige faktura$/i.test(description);
}

function isCardPayment(description: string) {
  return /^innbetaling$/i.test(description);
}

export function isDnbCreditCardPeriodRow(
  row: ImportRow,
): row is DnbCreditCardPeriodRow {
  return REQUIRED_COLUMNS.every((column) => column in row);
}

export function extractDnbCreditCardMerchant(description: string) {
  const firstSegment = firstCommaSegment(description);
  if (!firstSegment) return null;
  if (isCardPayment(firstSegment)) return null;
  if (isPriorStatementBalance(firstSegment)) return null;
  return toLocaleDisplayName(firstSegment);
}

export function normalizeDnbCreditCardPeriodRow(
  row: DnbCreditCardPeriodRow,
): ImportDraft | null {
  const description = row["Beløpet gjelder"]?.trim();
  const date = parseDateByPattern(row.Dato, "DD.MM.YYYY");
  if (!description || !date) return null;

  const metadata = {
    import: {
      format: DNB_CREDIT_CARD_PERIOD_FORMAT,
      provider: "DNB",
      product: "credit_card_period_export",
      row,
    },
    providerDescription: description,
  };

  if (isPriorStatementBalance(description)) {
    return {
      kind: "statement_balance",
      date,
      description,
      metadata,
    };
  }

  const incoming = parseLocalizedNumber(row.Inn);
  const outgoing = parseLocalizedNumber(row.Ut);
  if (incoming === null && outgoing === null) return null;

  const merchantName = extractDnbCreditCardMerchant(description);
  const normalizedMerchantName = normalizedMerchantOrNull(merchantName);
  const isPayment = isCardPayment(description);
  const amount = incoming !== null ? incoming : -Math.abs(outgoing ?? 0);
  const rowCurrency = row.Valuta?.trim().toUpperCase() || "NOK";
  const originalCurrency = rowCurrency === "NOK" ? null : rowCurrency;

  return {
    kind: "transaction",
    source: "import",
    amount: amount.toFixed(2),
    currency: "NOK",
    date,
    merchantName,
    normalizedMerchantName,
    description: merchantName ?? description,
    searchText: `${merchantName ?? description} ${description}`,
    transactionType: isPayment ? "internal_transfer" : "card_purchase",
    paymentChannel: "credit_card",
    excludedFromBudget: isPayment,
    originalAmount:
      originalCurrency && outgoing !== null ? Math.abs(outgoing).toFixed(2) : null,
    originalCurrency,
    metadata: {
      ...metadata,
      observedMerchantName: merchantName,
      import: {
        ...metadata.import,
        exchangeRate: row.Kurs ?? null,
      },
    },
  };
}

export const dnbCreditCardPeriodAdapter: ImportFormatAdapter<DnbCreditCardPeriodRow> = {
  id: DNB_CREDIT_CARD_PERIOD_FORMAT,
  label: "DNB credit card period export",
  canParse: isDnbCreditCardPeriodRow,
  normalizeRow: normalizeDnbCreditCardPeriodRow,
};
