/** Client-safe approval state for recurring bills. */

export type BillApprovalInput = {
  categoryId: string | null;
  userEndedAt: Date | null;
};

/**
 * Detected bills are approved by assigning a category. Excludes bills the user
 * explicitly ended (userEndedAt) from the approval queue.
 */
export function billNeedsApproval(bill: BillApprovalInput): boolean {
  return bill.categoryId == null && bill.userEndedAt == null;
}
