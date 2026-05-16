import { CircleAlert, CircleCheck, CircleHelp, Sparkles } from "lucide-react";

import {
  classificationStateLabel,
  formatConfidencePercent,
  type ClassificationUiState,
} from "@/lib/classification/ui-state";
import { cn } from "@/lib/utils";

const stateStyles: Record<ClassificationUiState, string> = {
  auto_applied: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
  suggestion: "border-amber-500/30 bg-amber-500/10 text-amber-700",
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
