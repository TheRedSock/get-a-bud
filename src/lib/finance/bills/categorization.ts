const AUTO_CATEGORY_SOURCES = new Set(["merchant", "rule", "model"]);

export type MatchCategoryInput = {
  categoryId: string | null;
  categorySource: string | null;
};

/**
 * When all matched transactions share one auto-applied category, return it as
 * a bill suggestion. Does not approve the bill — only informs the UI.
 */
export function inferSuggestedCategoryFromMatches(
  transactions: MatchCategoryInput[],
): string | null {
  if (transactions.length === 0) return null;

  let candidate: string | null = null;

  for (const txn of transactions) {
    if (!txn.categoryId) return null;
    if (txn.categorySource === "user") return null;
    if (!txn.categorySource || !AUTO_CATEGORY_SOURCES.has(txn.categorySource)) {
      return null;
    }
    if (candidate === null) {
      candidate = txn.categoryId;
    } else if (candidate !== txn.categoryId) {
      return null;
    }
  }

  return candidate;
}
