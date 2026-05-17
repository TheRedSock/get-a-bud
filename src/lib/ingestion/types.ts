export type NormalizedAccount = {
  providerAccountId: string;
  name: string;
  currency: string;
  balanceCents: number;
  kind?: "checking" | "savings" | "credit_card" | "investment" | "loan" | "other";
  institutionName?: string;
  raw?: Record<string, unknown>;
};

export type NormalizedTransaction = {
  providerTransactionId: string;
  providerAccountId: string;
  amountCents: number;
  currency: string;
  date: string;
  bookedAt?: Date;
  merchantName?: string;
  description: string;
  originalAmountCents?: number;
  originalCurrency?: string;
  raw?: Record<string, unknown>;
};

export type IngestionSyncResult = {
  accounts: NormalizedAccount[];
  transactions: NormalizedTransaction[];
  nextCursor?: string;
  rateLimitedUntil?: Date;
  continuationRequired?: boolean;
  progress?: {
    importedAccounts: number;
    importedTransactions: number;
    pagesFetched: number;
    currentAccountName?: string;
  };
};

export interface BankIngestionAdapter {
  provider: "enable_banking";
  sync(connectionId: string): Promise<IngestionSyncResult>;
}
