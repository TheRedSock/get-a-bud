import type { PipelineRunRow, PipelineRunSummary } from "@/lib/ingestion/pipeline/types";
import { isPipelineStale } from "@/lib/ingestion/pipeline/types";

export function serializePipelineRun(
  run: PipelineRunRow,
  connectionDisplayName: string | null,
): PipelineRunSummary {
  return {
    id: run.id,
    kind: run.kind,
    status: run.status,
    currentPhase: run.currentPhase,
    connectionId: run.connectionId,
    connectionDisplayName,
    counters: run.counters ?? {},
    phaseProgress: run.phaseProgress ?? {},
    lastHeartbeatAt: run.lastHeartbeatAt.toISOString(),
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    errorMessage: run.errorMessage,
    stale:
      (run.status === "running" || run.status === "queued") &&
      isPipelineStale(run.lastHeartbeatAt),
  };
}
