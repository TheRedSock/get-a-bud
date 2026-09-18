import type { AutoLabelMetadata } from "@/lib/classification/relabel";

const AUTO_CATEGORY_SOURCES = new Set(["merchant", "rule", "model"]);

export type BillLinkedTransactionRow = {
  id: string;
  categoryId: string | null;
  categorySource: string | null;
  suggestedCategoryId: string | null;
  description: string;
  suggestedDescription: string | null;
  merchantName: string | null;
  metadata: Record<string, unknown> | null;
};

type TransactionUserEdits = {
  descriptionEdited?: boolean;
};

type TransactionMetadata = {
  userEdits?: TransactionUserEdits;
  autoLabel?: AutoLabelMetadata;
};

/**
 * Whether a matched transaction's category may be replaced when the user sets a
 * bill category. Manual labels and user-confirmed suggestions are protected.
 */
export function canBillOverrideTransactionCategory(
  row: Pick<
    BillLinkedTransactionRow,
    "categorySource" | "categoryId" | "suggestedCategoryId"
  >,
): boolean {
  if (row.categorySource === "user") {
    return false;
  }

  if (row.suggestedCategoryId != null) {
    return true;
  }

  if (row.categoryId == null) {
    return true;
  }

  if (
    row.categorySource != null &&
    AUTO_CATEGORY_SOURCES.has(row.categorySource)
  ) {
    return true;
  }

  return row.categorySource !== "user";
}

/**
 * Whether a matched transaction's description may be replaced with the bill
 * name. Skips manual edits and user-confirmed transaction rows.
 */
export function canBillOverrideTransactionDescription(
  row: Pick<BillLinkedTransactionRow, "categorySource" | "metadata">,
): boolean {
  const meta = (row.metadata ?? {}) as TransactionMetadata;
  if (meta.userEdits?.descriptionEdited) {
    return false;
  }

  if (row.categorySource === "user") {
    return false;
  }

  return true;
}

export function buildBillCategoryTransactionPatch(
  billCategoryId: string,
  row: BillLinkedTransactionRow,
): {
  categoryId: string;
  categorySource: "user";
  categoryConfidence: string;
  suggestedCategoryId: null;
  suggestedDescription: null;
  suggestedMerchantName: null;
  updatedAt: Date;
} | null {
  if (!canBillOverrideTransactionCategory(row)) {
    return null;
  }

  return {
    categoryId: billCategoryId,
    categorySource: "user",
    categoryConfidence: "1.00",
    suggestedCategoryId: null,
    suggestedDescription: null,
    suggestedMerchantName: null,
    updatedAt: new Date(),
  };
}

export function buildBillDescriptionTransactionPatch(
  billName: string,
  row: BillLinkedTransactionRow,
): {
  description: string;
  searchText: string;
  suggestedDescription: null;
  updatedAt: Date;
} | null {
  if (!canBillOverrideTransactionDescription(row)) {
    return null;
  }

  const searchText = `${billName} ${row.merchantName ?? ""}`.trim();

  return {
    description: billName,
    searchText,
    suggestedDescription: null,
    updatedAt: new Date(),
  };
}

export function mergeBillTransactionPatches(
  categoryPatch: ReturnType<typeof buildBillCategoryTransactionPatch>,
  descriptionPatch: ReturnType<typeof buildBillDescriptionTransactionPatch>,
): Record<string, unknown> | null {
  if (!categoryPatch && !descriptionPatch) {
    return null;
  }

  return {
    ...categoryPatch,
    ...descriptionPatch,
    updatedAt: new Date(),
  };
}
