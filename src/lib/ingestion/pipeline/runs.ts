import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  householdPipelineRuns,
  ingestionConnections,
  type PipelineCounters,
  type PipelinePhaseProgress,
} from "@/db/schema";
import {
  ACTIVE_PIPELINE_STATUSES,
  type PipelineKind,
  type PipelinePhase,
  type PipelineRunRow,
} from "@/lib/ingestion/pipeline/types";
import { logger } from "@/lib/logger";

export type StartPipelineInput = {
  householdId: string;
  kind: PipelineKind;
  connectionId?: string | null;
  syncRunId?: string | null;
  initialPhase?: PipelinePhase;
  phaseProgress?: PipelinePhaseProgress;
};

export type ResolvePipelineSlotInput = {
  householdId: string;
  kind: PipelineKind;
  connectionId?: string | null;
  syncRunId?: string | null;
};

function mergeCounters(
  existing: PipelineCounters,
  delta: Partial<PipelineCounters>,
): PipelineCounters {
  const next = { ...existing };
  for (const [key, value] of Object.entries(delta)) {
    if (value === undefined) continue;
    const k = key as keyof PipelineCounters;
    const prev = next[k] ?? 0;
    next[k] = prev + value;
  }
  return next;
}

export async function findActiveRunsForHousehold(
  householdId: string,
): Promise<PipelineRunRow[]> {
  const rows = await db
    .select()
    .from(householdPipelineRuns)
    .where(
      and(
        eq(householdPipelineRuns.householdId, householdId),
        inArray(householdPipelineRuns.status, [...ACTIVE_PIPELINE_STATUSES]),
      ),
    )
    .orderBy(desc(householdPipelineRuns.startedAt));

  return rows;
}

export async function findActiveRunForConnection(
  connectionId: string,
): Promise<PipelineRunRow | undefined> {
  const [row] = await db
    .select()
    .from(householdPipelineRuns)
    .where(
      and(
        eq(householdPipelineRuns.connectionId, connectionId),
        eq(householdPipelineRuns.kind, "full_post_sync"),
        inArray(householdPipelineRuns.status, [...ACTIVE_PIPELINE_STATUSES]),
      ),
    )
    .orderBy(desc(householdPipelineRuns.startedAt))
    .limit(1);

  return row;
}

export async function findActiveRecurringReplay(
  householdId: string,
): Promise<PipelineRunRow | undefined> {
  const [row] = await db
    .select()
    .from(householdPipelineRuns)
    .where(
      and(
        eq(householdPipelineRuns.householdId, householdId),
        eq(householdPipelineRuns.kind, "recurring_replay"),
        inArray(householdPipelineRuns.status, [...ACTIVE_PIPELINE_STATUSES]),
      ),
    )
    .orderBy(desc(householdPipelineRuns.startedAt))
    .limit(1);

  return row;
}

export async function findActiveHouseholdClassify(
  householdId: string,
): Promise<PipelineRunRow | undefined> {
  const [row] = await db
    .select()
    .from(householdPipelineRuns)
    .where(
      and(
        eq(householdPipelineRuns.householdId, householdId),
        eq(householdPipelineRuns.kind, "categorize"),
        inArray(householdPipelineRuns.status, [...ACTIVE_PIPELINE_STATUSES]),
      ),
    )
    .orderBy(desc(householdPipelineRuns.startedAt))
    .limit(1);

  return row;
}

/** Resolves or creates a pipeline run for the given concurrency slot. */
export async function resolvePipelineRunForSlot(
  input: ResolvePipelineSlotInput,
): Promise<PipelineRunRow> {
  if (input.kind === "full_post_sync" && input.connectionId) {
    const existing = await findActiveRunForConnection(input.connectionId);
    if (existing) {
      if (input.syncRunId && existing.syncRunId !== input.syncRunId) {
        await db
          .update(householdPipelineRuns)
          .set({
            syncRunId: input.syncRunId,
            updatedAt: new Date(),
          })
          .where(eq(householdPipelineRuns.id, existing.id));
        return { ...existing, syncRunId: input.syncRunId };
      }
      return existing;
    }
  }

  if (input.kind === "recurring_replay") {
    const existing = await findActiveRecurringReplay(input.householdId);
    if (existing) return existing;
  }

  if (input.kind === "categorize") {
    const existing = await findActiveHouseholdClassify(input.householdId);
    if (existing) return existing;
  }

  return startPipelineRun({
    householdId: input.householdId,
    kind: input.kind,
    connectionId: input.connectionId,
    syncRunId: input.syncRunId,
    initialPhase:
      input.kind === "recurring_replay"
        ? "recurring"
        : input.kind === "categorize"
          ? "categorize"
          : "sync",
  });
}

export async function startPipelineRun(
  input: StartPipelineInput,
): Promise<PipelineRunRow> {
  const now = new Date();
  const [row] = await db
    .insert(householdPipelineRuns)
    .values({
      householdId: input.householdId,
      kind: input.kind,
      status: "queued",
      currentPhase: input.initialPhase ?? "sync",
      connectionId: input.connectionId ?? null,
      syncRunId: input.syncRunId ?? null,
      counters: {},
      phaseProgress: input.phaseProgress ?? {},
      lastHeartbeatAt: now,
      startedAt: now,
    })
    .returning();

  return row;
}

export async function getPipelineRunById(
  runId: string,
  householdId: string,
): Promise<PipelineRunRow | undefined> {
  const [row] = await db
    .select()
    .from(householdPipelineRuns)
    .where(
      and(
        eq(householdPipelineRuns.id, runId),
        eq(householdPipelineRuns.householdId, householdId),
      ),
    )
    .limit(1);

  return row;
}

export async function heartbeatPipelineRun(
  runId: string,
  patch?: {
    phaseProgress?: Partial<PipelinePhaseProgress>;
    counters?: Partial<PipelineCounters>;
    setCounters?: PipelineCounters;
    currentPhase?: PipelinePhase;
    status?: "queued" | "running" | "rate_limited";
  },
) {
  const [existing] = await db
    .select()
    .from(householdPipelineRuns)
    .where(eq(householdPipelineRuns.id, runId))
    .limit(1);

  if (!existing) return undefined;

  const counters = patch?.setCounters
    ? patch.setCounters
    : patch?.counters
      ? mergeCounters(existing.counters ?? {}, patch.counters)
      : existing.counters;

  const phaseProgress = patch?.phaseProgress
    ? { ...(existing.phaseProgress ?? {}), ...patch.phaseProgress }
    : existing.phaseProgress;

  const [updated] = await db
    .update(householdPipelineRuns)
    .set({
      lastHeartbeatAt: new Date(),
      updatedAt: new Date(),
      counters,
      phaseProgress,
      ...(patch?.currentPhase ? { currentPhase: patch.currentPhase } : {}),
      ...(patch?.status ? { status: patch.status } : {}),
    })
    .where(eq(householdPipelineRuns.id, runId))
    .returning();

  return updated;
}

export async function advancePipelinePhase(
  runId: string,
  phase: PipelinePhase,
) {
  return heartbeatPipelineRun(runId, {
    currentPhase: phase,
    status: "running",
  });
}

export async function setPipelineCountersFromSync(
  runId: string,
  importedAccounts: number,
  importedTransactions: number,
  extras?: Partial<PipelinePhaseProgress> & {
    status?: "running" | "rate_limited";
  },
) {
  const [existing] = await db
    .select({ counters: householdPipelineRuns.counters })
    .from(householdPipelineRuns)
    .where(eq(householdPipelineRuns.id, runId))
    .limit(1);

  if (!existing) return undefined;

  return heartbeatPipelineRun(runId, {
    status: extras?.status ?? "running",
    phaseProgress: extras,
    setCounters: {
      ...(existing.counters ?? {}),
      importedAccounts,
      importedTransactions,
    },
  });
}

export async function completePipelineRun(runId: string) {
  const [updated] = await db
    .update(householdPipelineRuns)
    .set({
      status: "succeeded",
      currentPhase: "done",
      finishedAt: new Date(),
      lastHeartbeatAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(householdPipelineRuns.id, runId))
    .returning();

  return updated;
}

export async function failPipelineRun(runId: string, errorMessage: string) {
  logger.warn("Pipeline run failed", { runId, errorMessage });

  const [updated] = await db
    .update(householdPipelineRuns)
    .set({
      status: "failed",
      finishedAt: new Date(),
      errorMessage,
      lastHeartbeatAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(householdPipelineRuns.id, runId))
    .returning();

  return updated;
}

export async function findPipelineRunBySyncRunId(
  syncRunId: string,
): Promise<PipelineRunRow | undefined> {
  const [row] = await db
    .select()
    .from(householdPipelineRuns)
    .where(eq(householdPipelineRuns.syncRunId, syncRunId))
    .orderBy(desc(householdPipelineRuns.startedAt))
    .limit(1);

  return row;
}

export async function loadConnectionDisplayNames(
  connectionIds: string[],
): Promise<Map<string, string>> {
  if (connectionIds.length === 0) return new Map();

  const rows = await db
    .select({
      id: ingestionConnections.id,
      displayName: ingestionConnections.displayName,
    })
    .from(ingestionConnections)
    .where(inArray(ingestionConnections.id, connectionIds));

  return new Map(rows.map((r) => [r.id, r.displayName]));
}

export async function markStalePipelineRunsFailed() {
  const threshold = new Date(Date.now() - 15 * 60 * 1000);

  const result = await db
    .update(householdPipelineRuns)
    .set({
      status: "failed",
      errorMessage: "Pipeline stalled and was marked failed.",
      finishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        inArray(householdPipelineRuns.status, ["queued", "running"]),
        sql`${householdPipelineRuns.lastHeartbeatAt} < ${threshold}`,
      ),
    )
    .returning({ id: householdPipelineRuns.id });

  if (result.length > 0) {
    logger.warn("Marked stale pipeline runs as failed", {
      count: result.length,
      runIds: result.map((r) => r.id),
    });
  }
}

export async function pruneOldActivityEvents(retentionDays = 7) {
  const threshold = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const { pipelineActivityEvents } = await import("@/db/schema");

  await db
    .delete(pipelineActivityEvents)
    .where(sql`${pipelineActivityEvents.occurredAt} < ${threshold}`);
}
