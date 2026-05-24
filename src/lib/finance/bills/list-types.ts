/** Client-safe list shapes for bills UI (no database imports). */

export type BillListItem = {
  id: string;
  name: string;
  merchantPattern: string;
  cadence: string;
  expectedAmountCents: number | null;
  lastAmountCents: number | null;
  nextDueDate: string | null;
  isActive: boolean;
  isPossiblyCancelled: boolean;
  isDuplicateSubscription: boolean;
  detectedCadenceConfidence: string | null;
  categoryId: string | null;
  categoryName: string | null;
  suggestedCategoryId: string | null;
  suggestedCategoryName: string | null;
  originalCurrency: string | null;
  lastOriginalAmountCents: number | null;
  amountTrend: string | null;
  userEndedAt: Date | null;
  autoEndedAt: Date | null;
  lastPaymentDate: string | null;
  updatedAt: Date;
};

export type CategoryOption = {
  id: string;
  name: string;
};
