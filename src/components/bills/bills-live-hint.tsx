"use client";

import { usePipelineLive } from "@/components/pipeline/pipeline-live-context";

export function BillsLiveHint() {
  const { hasActiveRuns, runs } = usePipelineLive();

  const recurringActive = runs.some(
    (r) =>
      r.currentPhase === "recurring" &&
      (r.status === "running" || r.status === "queued"),
  );

  if (!recurringActive) {
    return null;
  }

  return (
    <p className="rounded-2xl border border-brand/20 bg-brand/5 px-4 py-3 text-sm text-muted-foreground">
      Recurring bills are being detected. New suggestions may appear shortly.
    </p>
  );
}
