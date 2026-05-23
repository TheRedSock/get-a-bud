"use client";

import { usePipelineLive } from "@/components/pipeline/pipeline-live-context";
import { cn } from "@/lib/utils";

export function AccountsLiveHint() {
  const { hasActiveRuns, runs } = usePipelineLive();

  if (!hasActiveRuns) {
    return null;
  }

  const importing = runs.some((r) => r.currentPhase === "sync");

  return (
    <p
      className={cn(
        "rounded-2xl border border-brand/20 bg-brand/5 px-4 py-3 text-sm text-muted-foreground",
      )}
    >
      {importing
        ? "Accounts and balances may update as bank sync progresses."
        : "Accounts may update while background processing runs."}
    </p>
  );
}
