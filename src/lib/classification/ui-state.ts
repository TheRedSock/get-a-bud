export type CategorySource = "merchant" | "rule" | "model" | "user" | null;

export type ClassificationUiState =
  | "auto_applied"
  | "suggestion"
  | "needs_review"
  | "user_confirmed"
  | "none";

export type ClassificationUiInput = {
  categoryId?: string | null;
  categorySource?: CategorySource | string;
  categoryConfidence?: string | null;
  suggestedCategoryId?: string | null;
  metadata?: {
    autoLabel?: {
      undone?: boolean;
    } | null;
  } | null;
};

const autoSources = new Set(["merchant", "rule", "model"]);

export function getClassificationUiState(
  transaction: ClassificationUiInput,
): ClassificationUiState {
  if (transaction.categorySource === "user") {
    return "user_confirmed";
  }

  if (
    transaction.categorySource &&
    autoSources.has(transaction.categorySource)
  ) {
    return "auto_applied";
  }

  if (!transaction.categoryId && transaction.suggestedCategoryId) {
    return "suggestion";
  }

  if (!transaction.categoryId) {
    return "needs_review";
  }

  return "none";
}

export function canUndoAutoLabel(transaction: ClassificationUiInput) {
  return Boolean(transaction.metadata?.autoLabel && !transaction.metadata.autoLabel.undone);
}

export function classificationStateLabel(state: ClassificationUiState) {
  switch (state) {
    case "auto_applied":
      return "Auto-labeled";
    case "suggestion":
      return "Suggestion";
    case "needs_review":
      return "Needs review";
    case "user_confirmed":
      return "User confirmed";
    case "none":
    default:
      return "Classified";
  }
}

export function formatConfidencePercent(confidence?: string | number | null) {
  if (confidence == null || confidence === "") return null;
  const numeric =
    typeof confidence === "number" ? confidence : Number.parseFloat(confidence);
  if (!Number.isFinite(numeric)) return null;
  return `${Math.round(numeric * 100)}%`;
}
