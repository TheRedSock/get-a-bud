import type {
  PipelineCounters,
  PipelinePhaseProgress,
} from "@/db/schema/pipeline";
import {
  pipelineKindEnum,
  pipelinePhaseEnum,
  syncStatusEnum,
} from "@/db/schema";

export const ACTIVE_PIPELINE_STATUSES = [
  "queued",
  "running",
  "rate_limited",
] as const;

export type PipelineStatus = (typeof syncStatusEnum.enumValues)[number];

export type PipelineKind = (typeof pipelineKindEnum.enumValues)[number];

export type PipelinePhase = (typeof pipelinePhaseEnum.enumValues)[number];

export const PIPELINE_PHASE_ORDER: PipelinePhase[] = [
  "sync",
  "categorize",
  "link",
  "recurring",
  "done",
];

export type PipelineRunRow = {
  id: string;
  householdId: string;
  kind: PipelineKind;
  status: PipelineStatus;
  currentPhase: PipelinePhase;
  connectionId: string | null;
  syncRunId: string | null;
  counters: PipelineCounters;
  phaseProgress: PipelinePhaseProgress;
  lastHeartbeatAt: Date;
  startedAt: Date;
  finishedAt: Date | null;
  errorMessage: string | null;
};

export type PipelineRunSummary = {
  id: string;
  kind: PipelineKind;
  status: PipelineStatus;
  currentPhase: PipelinePhase;
  connectionId: string | null;
  connectionDisplayName: string | null;
  counters: PipelineCounters;
  phaseProgress: PipelinePhaseProgress;
  lastHeartbeatAt: string;
  startedAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
  stale: boolean;
};

export const STALE_HEARTBEAT_MS = 5 * 60 * 1000;
export const STALE_FAIL_MS = 15 * 60 * 1000;

export function isPipelineStale(lastHeartbeatAt: Date, now = Date.now()) {
  return now - lastHeartbeatAt.getTime() > STALE_HEARTBEAT_MS;
}

export function isActivePipelineStatus(
  status: string,
): status is (typeof ACTIVE_PIPELINE_STATUSES)[number] {
  return (ACTIVE_PIPELINE_STATUSES as readonly string[]).includes(status);
}
