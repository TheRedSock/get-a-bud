/**
 * Types for the enhanced recurring detection system (Phase 2B).
 */

/** Supported bill cadence values — matches the DB enum. */
export type BillCadence =
  | "weekly"
  | "biweekly"
  | "monthly"
  | "quarterly"
  | "semi_annual"
  | "yearly"
  | "unknown";

/** How the recurring pattern is anchored in time. */
export type RecurrencePattern = "day_of_month" | "fixed_interval" | "irregular";

/** Amount trend over recent billing periods. */
export type AmountTrend = "stable" | "increasing" | "decreasing" | "volatile";

/** A single amount observation for trend analysis. */
export interface AmountObservation {
  value: number;
  currency: string;
  date: string;
}

/** Full recurrence analysis result for a merchant + amount cluster. */
export interface RecurrenceAnalysis {
  isRecurring: boolean;
  merchant: string;
  cadence: BillCadence;
  confidence: number;
  pattern: RecurrencePattern;
  predictedNextDate: string | null;
  typicalDayOfMonth: number | null;
  amountTrend: AmountTrend;
  lastAmounts: AmountObservation[];
  priceChangeDetected: boolean;
  transactionCount: number;
  originalCurrency: string | null;
  lastOriginalAmount: number | null;
  /** Disambiguates multiple recurring patterns for the same merchant.
   *  Format: "{currency}~{roundedMedianAmount}" */
  amountSignature: string;
  /** IDs of the transactions that form this recurring pattern. */
  transactionIds: string[];
  /** IDs of transactions matched with wider tolerance (late payments). */
  delayedTransactionIds: string[];
  /** Year-month strings ("2025-03") where an expected payment was not found. */
  missingPeriods: string[];
  /** True when multiple patterns were found in the same amount cluster,
   *  suggesting duplicate subscriptions to the same service. */
  isDuplicateSubscription: boolean;
}

/**
 * Minimal transaction shape needed by the recurring detection algorithm.
 * Avoids coupling to the full DB row type.
 */
export interface RecurringTransactionInput {
  id: string;
  amount: string;
  currency: string;
  date: string;
  originalAmount: string | null;
  originalCurrency: string | null;
  merchantId?: string | null;
  normalizedMerchantName: string | null;
  transactionType: string | null;
}
