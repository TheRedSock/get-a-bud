import {
  canUndoAutoLabel,
  getClassificationUiState,
  type ClassificationUiInput,
  type ClassificationUiState,
} from "@/lib/classification/ui-state";

export type TransactionViewFields = {
  classificationState: ClassificationUiState;
  undoAutoLabelAvailable: boolean;
  canEditAmount: boolean;
  canEditDate: boolean;
};

type TransactionViewInput = ClassificationUiInput & {
  source: string;
  metadata?: ClassificationUiInput["metadata"];
};

/** Server-side view fields for transaction UI (classification + editability). */
export function buildTransactionViewFields(
  transaction: TransactionViewInput,
): TransactionViewFields {
  const isManual = transaction.source === "manual";

  return {
    classificationState: getClassificationUiState(transaction),
    undoAutoLabelAvailable: canUndoAutoLabel(transaction),
    canEditAmount: isManual,
    canEditDate: isManual,
  };
}
