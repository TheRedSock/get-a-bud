export type TransactionSyncParams = {
  dateFrom?: string;
  dateTo?: string;
  strategy: "default" | "longest";
  transactionStatus: "BOOK";
};

export type SyncProgress = {
  importedAccounts: number;
  importedTransactions: number;
  pagesFetched: number;
  currentAccountId?: string;
  currentAccountName?: string;
  rateLimitedUntil?: string;
};

export type EnableBankingSyncMetadata = {
  enableBanking?: {
    transactionParams?: TransactionSyncParams;
    completedAccountIds?: string[];
    accountCursors?: Record<
      string,
      {
        continuationKey: string;
        paramsKey: string;
      }
    >;
    progress?: SyncProgress;
  };
};

export const DEFAULT_SYNC_PAGE_BUDGET = 10;
export const DEFAULT_SYNC_TIME_BUDGET_MS = 3 * 60 * 1000;

export type ConnectionMetadata = Record<string, unknown> & {
  enableBanking?: {
    initialTransactionSyncCompleted?: boolean;
    initialTransactionSyncCompletedAt?: string;
  };
};

export type TransactionMetadata = Record<string, unknown> & {
  providerDescription?: string;
  observedMerchantName?: string | null;
  providerMerchantName?: string | null;
  parsed?: {
    transactionType: string;
    paymentChannel: string;
    merchantName: string | null;
    merchantAddress: string | null;
    counterparty: string | null;
    purpose: string | null;
    metadata: Record<string, string | number | null>;
  };
  userEdits?: {
    descriptionEdited?: boolean;
    merchantNameEdited?: boolean;
    originalDescription?: string;
    originalMerchantName?: string | null;
    updatedAt?: string;
  };
  autoLabel?: {
    appliedAt: string;
    source: string;
    confidence: number;
    originalDescription: string;
    originalMerchantName: string | null;
    appliedDescription: string;
    appliedMerchantName: string | null;
    appliedCategoryId: string | null;
    undone: boolean;
  };
};
