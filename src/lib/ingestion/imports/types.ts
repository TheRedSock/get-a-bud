export type ImportRowValue = string | number | null | undefined;

export type ImportRow = Record<string, ImportRowValue>;

export type ImportTransactionDraft = {
  kind: "transaction";
  source: "import";
  amountCents: number;
  currency: string;
  date: string;
  merchantName: string | null;
  normalizedMerchantName: string | null;
  description: string;
  searchText: string;
  transactionType: "card_purchase" | "internal_transfer";
  paymentChannel: "credit_card";
  excludedFromBudget: boolean;
  originalAmountCents: number | null;
  originalCurrency: string | null;
  metadata: Record<string, unknown>;
};

export type StatementBalanceDraft = {
  kind: "statement_balance";
  date: string | null;
  description: string;
  metadata: Record<string, unknown>;
};

export type ImportDraft = ImportTransactionDraft | StatementBalanceDraft;

export interface ImportFormatAdapter<Row extends ImportRow = ImportRow> {
  id: string;
  label: string;
  canParse(row: ImportRow): row is Row;
  normalizeRow(row: Row): ImportDraft | null;
}
