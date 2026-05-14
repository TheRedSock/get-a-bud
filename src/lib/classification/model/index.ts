/**
 * Tier 2 Statistical Classifier — training, inference, and serialization.
 *
 * Per-household Naive Bayes text classifier backed by
 * `wink-naive-bayes-text-classifier` with Norwegian-stemmed features from
 * `natural`. Model sizes are 10–50 KB and train in milliseconds.
 *
 * Key design constraints:
 * - `computeOdds()` returns uncalibrated log-base-2 odds, NOT probabilities.
 *   Scores are converted to a 0–1 range via margin-based sigmoid normalization.
 * - Per-household thresholds are derived from cross-validation, not global
 *   constants. When thresholds are null, the model operates in review-only mode.
 * - The prep task is identity (split on whitespace) because all preprocessing
 *   (Norwegian stemming, namespace prefixing) happens inside `extractFeatures`.
 */

import createClassifier from "wink-naive-bayes-text-classifier";
import type { NaiveBayesTextClassifier } from "wink-naive-bayes-text-classifier";

import {
  extractFeatures,
  type TransactionFeatureInput,
} from "@/lib/classification/model/features";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ClassificationResult {
  label: string;
  score: number;
}

export interface TrainedModelOutput {
  modelJson: string;
  trainingCount: number;
  categoryCount: number;
  accuracy: number;
  thresholds: ComputedThresholds;
}

export interface ComputedThresholds {
  autoApplyThreshold: number | null;
  suggestThreshold: number | null;
}

export interface LabeledTransaction extends TransactionFeatureInput {
  categoryId: string;
}

export interface LoadedModel {
  classifier: NaiveBayesTextClassifier;
  thresholds: ComputedThresholds;
}

// ---------------------------------------------------------------------------
// Classifier creation helpers
// ---------------------------------------------------------------------------

/**
 * Identity prep task — split on whitespace only.
 *
 * All actual preprocessing (normalization, Norwegian stemming, namespace
 * prefixing) is already done by `extractFeatures()`. Do NOT use the
 * library's built-in `prepText` — it destroys structured token prefixes
 * like `type:` and `amt:`.
 */
function identityPrepTask(text: string): string[] {
  return text.split(/\s+/).filter((t) => t.length > 0);
}

function newClassifier(): NaiveBayesTextClassifier {
  const clf = createClassifier();
  clf.definePrepTasks([identityPrepTask]);
  clf.defineConfig({ considerOnlyPresence: false, smoothingFactor: 0.5 });
  return clf;
}

// ---------------------------------------------------------------------------
// Inference
// ---------------------------------------------------------------------------

/**
 * Classify a transaction using a loaded model.
 *
 * Returns null when the classifier predicts "unknown" (all tokens unseen).
 * The returned `score` is a 0–1 value derived from the margin between the
 * top and second-best label's log-odds. It is NOT a calibrated probability.
 */
export function classifyTransaction(
  model: LoadedModel,
  txn: TransactionFeatureInput,
): ClassificationResult | null {
  const tokens = extractFeatures(txn);
  if (tokens.length === 0) return null;

  const input = tokens.join(" ");
  return classifyWithScore(model.classifier, input);
}

/**
 * Convert raw classifier output to a scored result.
 *
 * Uses the margin between the top and second-best log-odds to produce a
 * sigmoid-normalized 0–1 score. Larger margin = higher confidence.
 *
 * Sigmoid parameters (0.3 slope, 2.0 center) are initial values calibrated
 * so that margin≈2 → 0.50, margin≈5 → 0.75, margin≈10 → 0.90.
 */
export function classifyWithScore(
  classifier: NaiveBayesTextClassifier,
  input: string,
): ClassificationResult | null {
  const prediction = classifier.predict(input);
  if (prediction === "unknown") return null;

  const odds = classifier.computeOdds(input);
  if (odds.length === 0) return null;

  const topOdds = odds[0][1];
  const secondOdds = odds.length > 1 ? odds[1][1] : topOdds - 10;

  const margin = topOdds - secondOdds;
  const score = 1 / (1 + Math.exp(-0.3 * (margin - 2)));

  return {
    label: prediction,
    score: Math.round(score * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// Training
// ---------------------------------------------------------------------------

/** Minimum labeled examples per category to include in training. */
const MIN_EXAMPLES_PER_CATEGORY = 3;
/** Minimum total labeled transactions to train a model. */
const MIN_TRAINING_SAMPLES = 20;

/**
 * Train a model with 80/20 holdout cross-validation for accuracy estimation
 * and per-household threshold derivation. Then retrain on the full dataset
 * for the production model.
 *
 * Returns null when there is insufficient training data.
 */
export function trainModel(
  data: LabeledTransaction[],
): TrainedModelOutput | null {
  // Filter categories with too few examples
  const categoryCounts = new Map<string, number>();
  for (const t of data) {
    categoryCounts.set(
      t.categoryId,
      (categoryCounts.get(t.categoryId) ?? 0) + 1,
    );
  }
  const validCategories = new Set(
    [...categoryCounts.entries()]
      .filter(([, count]) => count >= MIN_EXAMPLES_PER_CATEGORY)
      .map(([id]) => id),
  );
  const filtered = data.filter((t) => validCategories.has(t.categoryId));

  if (filtered.length < MIN_TRAINING_SAMPLES) return null;

  // --- Cross-validation on 80/20 holdout ---
  const shuffled = [...filtered].sort(() => Math.random() - 0.5);
  const split = Math.floor(shuffled.length * 0.8);
  const trainSet = shuffled.slice(0, split);
  const testSet = shuffled.slice(split);

  const cvClassifier = newClassifier();
  for (const txn of trainSet) {
    const tokens = extractFeatures(txn).join(" ");
    cvClassifier.learn(tokens, txn.categoryId);
  }
  cvClassifier.consolidate();

  // Evaluate holdout set
  const testPredictions: Array<{ score: number; correct: boolean }> = [];
  let correctCount = 0;
  for (const txn of testSet) {
    const tokens = extractFeatures(txn).join(" ");
    const result = classifyWithScore(cvClassifier, tokens);
    if (result) {
      const correct = result.label === txn.categoryId;
      if (correct) correctCount++;
      testPredictions.push({ score: result.score, correct });
    }
  }

  const accuracy = testSet.length > 0 ? correctCount / testSet.length : 0;
  const thresholds = computeThresholds(testPredictions);

  // --- Retrain on full dataset for production model ---
  const fullClassifier = newClassifier();
  for (const txn of filtered) {
    const tokens = extractFeatures(txn).join(" ");
    fullClassifier.learn(tokens, txn.categoryId);
  }
  fullClassifier.consolidate();

  return {
    modelJson: fullClassifier.exportJSON(),
    trainingCount: filtered.length,
    categoryCount: validCategories.size,
    accuracy,
    thresholds,
  };
}

/**
 * Load a serialized model from its JSON string.
 *
 * The model JSON comes from `exportJSON()` during training and is stored in
 * the database. `importJSON()` accepts the raw JSON string (it parses
 * internally).
 */
export function loadModelFromJson(
  modelJson: string,
  thresholds: ComputedThresholds,
): LoadedModel {
  const classifier = newClassifier();
  classifier.importJSON(modelJson);
  classifier.consolidate();

  return { classifier, thresholds };
}

// ---------------------------------------------------------------------------
// Threshold derivation
// ---------------------------------------------------------------------------

/**
 * Derive per-household auto-apply and suggest thresholds from cross-validation
 * predictions. Walks from low to high score, finding the lowest threshold
 * where predictions at or above it meet accuracy requirements:
 * - Auto-apply: 90%+ accuracy in the score band
 * - Suggest: 60%+ accuracy in the score band
 *
 * Returns null thresholds when the holdout set is too small or accuracy is
 * insufficient at any threshold. Null thresholds mean the model operates in
 * review-only mode.
 */
export function computeThresholds(
  testPredictions: Array<{ score: number; correct: boolean }>,
): ComputedThresholds {
  let autoApply: number | null = null;
  let suggest: number | null = null;

  if (testPredictions.length < 10) {
    return { autoApplyThreshold: null, suggestThreshold: null };
  }

  const sorted = [...testPredictions].sort((a, b) => a.score - b.score);

  for (
    let threshold = 0.4;
    threshold <= 0.95;
    threshold = Math.round((threshold + 0.05) * 100) / 100
  ) {
    const above = sorted.filter((p) => p.score >= threshold);
    if (above.length < 5) continue;
    const accuracy = above.filter((p) => p.correct).length / above.length;

    if (accuracy >= 0.9 && autoApply === null) {
      autoApply = threshold;
    }
    if (accuracy >= 0.6 && suggest === null) {
      suggest = threshold;
    }
  }

  return { autoApplyThreshold: autoApply, suggestThreshold: suggest };
}
