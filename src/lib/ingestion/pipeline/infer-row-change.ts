export type PipelineRowChangeKind =
  | "imported"
  | "categorized"
  | "linked"
  | "bill";

type RowSnapshot = {
  id: string;
  categoryId?: string | null;
  suggestedCategoryId?: string | null;
  transferGroupId?: string | null;
  transferSummary?: unknown;
  recurringBillId?: string | null;
};

export function inferPipelineRowChange(
  prev: RowSnapshot | undefined,
  next: RowSnapshot,
): PipelineRowChangeKind | null {
  if (!prev) {
    return "imported";
  }

  if (
    prev.categoryId !== next.categoryId ||
    prev.suggestedCategoryId !== next.suggestedCategoryId
  ) {
    return "categorized";
  }

  if (
    prev.transferGroupId !== next.transferGroupId ||
    prev.transferSummary !== next.transferSummary
  ) {
    return "linked";
  }

  if (prev.recurringBillId !== next.recurringBillId) {
    return "bill";
  }

  return null;
}
