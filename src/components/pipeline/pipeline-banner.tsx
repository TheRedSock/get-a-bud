"use client";

import { Pause, Play, RefreshCw, X } from "lucide-react";

import { PipelineActivityFeed } from "@/components/pipeline/pipeline-activity-feed";
import {
  PipelinePhaseStepper,
  pipelineCounterSummary,
} from "@/components/pipeline/pipeline-phase-stepper";
import { usePipelineLive } from "@/components/pipeline/pipeline-live-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PipelineRunSummary } from "@/lib/ingestion/pipeline/types";
import { cn } from "@/lib/utils";

function RunCard({
  run,
  onDismiss,
}: {
  run: PipelineRunSummary;
  onDismiss: () => void;
}) {
  const title =
    run.kind === "recurring_replay"
      ? "Recurring bill detection"
      : run.connectionDisplayName
        ? `Sync · ${run.connectionDisplayName}`
        : "Account processing";

  return (
    <div
      className={cn(
        "grid gap-3 rounded-2xl border bg-background/80 p-4",
        run.stale && "border-warning/50",
        run.status === "failed" && "border-danger/40",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid gap-1">
          <p className="font-semibold text-sm">{title}</p>
          <p className="text-xs text-muted-foreground">
            {pipelineCounterSummary(run)}
          </p>
          {run.currentPhase === "categorize" && run.status === "running" ? (
            <p className="text-xs text-muted-foreground">
              Updating classifications in bulk…
            </p>
          ) : null}
          {run.stale ? (
            <p className="text-xs text-warning">
              Pipeline may be stalled. Try refreshing or check back shortly.
            </p>
          ) : null}
          {run.status === "failed" && run.errorMessage ? (
            <p className="text-xs text-danger">{run.errorMessage}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Badge
            className={
              run.status === "failed"
                ? "border-danger/40 bg-danger/10 text-danger"
                : undefined
            }
          >
            {run.status === "rate_limited" ? "Paused by bank" : run.status}
          </Badge>
          {!run.status.match(/running|queued|rate_limited/) ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8"
              onClick={onDismiss}
              aria-label="Dismiss"
            >
              <X className="size-4" />
            </Button>
          ) : null}
        </div>
      </div>
      <PipelinePhaseStepper run={run} />
      <PipelineActivityFeed runId={run.id} />
    </div>
  );
}

export function PipelineBanner() {
  const {
    runs,
    hasActiveRuns,
    liveMode,
    setLiveMode,
    dismissRun,
    offPageNewCount,
    overflowMessage,
    refreshRuns,
  } = usePipelineLive();

  if (runs.length === 0) {
    return null;
  }

  const showBanner = hasActiveRuns || runs.some((r) => r.status === "failed" || r.stale);

  if (!showBanner) {
    return null;
  }

  return (
    <section
      className="mb-6 grid gap-3 rounded-3xl border border-brand/20 bg-brand/5 p-4"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-semibold text-sm">Background processing</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setLiveMode(liveMode === "live" ? "paused" : "live")}
          >
            {liveMode === "live" ? (
              <>
                <Pause className="size-4" aria-hidden />
                Pause live view
              </>
            ) : (
              <>
                <Play className="size-4" aria-hidden />
                Resume live view
              </>
            )}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => void refreshRuns()}
          >
            <RefreshCw className="size-4" aria-hidden />
            Refresh status
          </Button>
        </div>
      </div>

      {offPageNewCount > 0 && liveMode === "live" ? (
        <p className="text-sm text-muted-foreground">
          {offPageNewCount} new transaction{offPageNewCount === 1 ? "" : "s"} on
          other pages.
        </p>
      ) : null}

      {overflowMessage ? (
        <p className="text-sm text-muted-foreground">{overflowMessage}</p>
      ) : null}

      <div className="grid gap-3">
        {runs.map((run) => (
          <RunCard key={run.id} run={run} onDismiss={() => dismissRun(run.id)} />
        ))}
      </div>
    </section>
  );
}
