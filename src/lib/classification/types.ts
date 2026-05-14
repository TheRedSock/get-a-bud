/**
 * Shared types across the classification system.
 */

/** How a category was assigned to a transaction. */
export type CategorySource = "merchant" | "rule" | "model" | "user";

/** Which parser processed a transaction description. */
export type ParserSourceLabel = "norwegian" | "regex_pattern" | "none";

/** Match field for categorization rules. */
export type MatchField = "merchant" | "description" | "counterparty";

/** Result from category detection (Tier 1 rule engine). */
export interface CategoryDetectionResult {
  categoryId: string;
  confidence: number;
  source: CategorySource;
}

/** Confidence thresholds for auto-labeling decisions. */
export const CONFIDENCE_THRESHOLDS = {
  /** Auto-apply category (green indicator, inline undo). */
  AUTO_APPLY: 0.85,
  /** Suggest category but don't apply (amber indicator, requires approval). */
  SUGGEST: 0.5,
  /** User-confirmed (no indicator). */
  USER_CONFIRMED: 1.0,
} as const;

/**
 * Number of user category corrections since the last model retrain before
 * triggering a new retrain event. Shared between the PATCH route (which
 * increments the counter) and the Inngest retrain function.
 */
export const RETRAIN_CORRECTION_THRESHOLD = 10;
