/**
 * Type declarations for wink-naive-bayes-text-classifier v2.x
 *
 * The library has no bundled types or DefinitelyTyped entry.
 */
declare module "wink-naive-bayes-text-classifier" {
  interface ClassifierConfig {
    considerOnlyPresence?: boolean;
    smoothingFactor?: number;
  }

  interface ClassifierStats {
    labelWiseSamples: Record<string, number>;
    words: number;
    vocabulary: number;
  }

  interface ClassifierMetrics {
    avgPrecision: number;
    avgRecall: number;
    avgFMeasure: number;
    details: Record<
      string,
      { precision: number; recall: number; fmeasure: number }
    >;
  }

  /** A single [label, log-base-2 odds] pair, sorted descending by odds. */
  type OddsPair = [label: string, logOdds: number];

  export interface NaiveBayesTextClassifier {
    definePrepTasks(tasks: Array<(input: string) => string[]>): number;
    defineConfig(config: ClassifierConfig): boolean;
    learn(input: string, label: string): boolean;
    consolidate(): boolean;
    predict(input: string): string;
    computeOdds(input: string): OddsPair[];
    stats(): ClassifierStats;
    exportJSON(): string;
    importJSON(json: string): boolean;
    evaluate(input: string, label: string): string;
    metrics(): ClassifierMetrics;
    reset(): boolean;
  }

  function createClassifier(): NaiveBayesTextClassifier;
  export default createClassifier;
}
