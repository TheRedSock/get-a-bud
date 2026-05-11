export type NormalizedAccount = {
  providerAccountId: string;
  name: string;
  currency: string;
  balance: string;
  kind?: "checking" | "savings" | "credit_card" | "investment" | "loan" | "other";
  raw?: Record<string, unknown>;
};

export type NormalizedTransaction = {
  providerTransactionId: string;
  providerAccountId: string;
  amount: string;
  currency: string;
  date: string;
  bookedAt?: Date;
  merchantName?: string;
  description: string;
  raw?: Record<string, unknown>;
};

export type IngestionSyncResult = {
  accounts: NormalizedAccount[];
  transactions: NormalizedTransaction[];
  nextCursor?: string;
  rateLimitedUntil?: Date;
};

export interface BankIngestionAdapter {
  provider: "enable_banking";
  sync(connectionId: string): Promise<IngestionSyncResult>;
}
