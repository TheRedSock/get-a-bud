import { CircleAlert, CircleCheck, CircleHelp, Sparkles } from "lucide-react";

import {
  classificationStateLabel,
  formatConfidencePercent,
  type ClassificationUiState,
} from "@/lib/classification/ui-state";
import { cn } from "@/lib/utils";

const stateStyles: Record<ClassificationUiState, string> = {
  auto_applied: "border-success/30 bg-success/10 text-success-foreground",
  suggestion: "border-warning/30 bg-warning/10 text-warning-foreground",
  needs_review: "border-destructive/30 bg-destructive/10 text-destructive",
  user_confirmed: "border-border bg-secondary/70 text-secondary-foreground",
  none: "border-border bg-secondary/70 text-secondary-foreground",
};

export function ClassificationIndicator({
  confidence,
  source,
  state,
  variant = "default",
}: {
  confidence?: string | null;
  source?: string | null;
  state: ClassificationUiState;
  variant?: "default" | "icon";
}) {
  if (state === "none" || state === "user_confirmed") {
    return null;
  }

  const label = classificationStateLabel(state);
  const confidenceLabel = formatConfidencePercent(confidence);
  const confidenceSentence = confidenceLabel
    ? ` Category confidence: ${confidenceLabel}.`
    : "";
  const detail = source
    ? `${label} by ${source}.${confidenceSentence}`
    : `${label}.${confidenceSentence}`;

  const Icon =
    state === "auto_applied"
      ? Sparkles
      : state === "suggestion"
        ? CircleHelp
        : state === "needs_review"
          ? CircleAlert
          : CircleCheck;

  if (variant === "icon") {
    return (
      <span
        className={cn(
          "inline-flex size-7 shrink-0 items-center justify-center rounded-full border",
          stateStyles[state],
        )}
        title={detail.trim()}
      >
        <Icon className="size-3.5" aria-hidden />
        <span className="sr-only">{detail}</span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium",
        stateStyles[state],
      )}
      title={detail.trim()}
    >
      <Icon className="size-3.5" />
      {label}
      {confidenceLabel ? <span>{confidenceLabel}</span> : null}
    </span>
  );
}
