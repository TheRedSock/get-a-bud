import {
  advancePipelinePhase,
  appendPipelineActivityEvents,
  batchCategorizedActivity,
  batchImportedActivity,
  batchLinkedActivity,
  completePipelineRun,
  failPipelineRun,
  findActiveRecurringReplay,
  findActiveRunForConnection,
  findPipelineRunBySyncRunId,
  heartbeatPipelineRun,
  recordPhaseStarted,
  resolvePipelineRunForSlot,
  setPipelineCountersFromSync,
} from "@/lib/ingestion/pipeline";
import type { PipelinePhase } from "@/lib/ingestion/pipeline/types";

export async function ensureFullPostSyncPipeline(input: {
  householdId: string;
  connectionId: string;
  syncRunId: string;
}) {
  return resolvePipelineRunForSlot({
    householdId: input.householdId,
    kind: "full_post_sync",
    connectionId: input.connectionId,
    syncRunId: input.syncRunId,
  });
}

export async function resolvePipelineForSyncRun(syncRunId: string) {
  return findPipelineRunBySyncRunId(syncRunId);
}

export async function resolvePipelineForPostSyncJob(input: {
  householdId: string;
  connectionId?: string;
}) {
  if (input.connectionId) {
    const byConnection = await findActiveRunForConnection(input.connectionId);
    if (byConnection) return byConnection;
  }

  const { findActiveRunsForHousehold } = await import(
    "@/lib/ingestion/pipeline/runs"
  );
  const runs = await findActiveRunsForHousehold(input.householdId);
  return runs.find((r) => r.kind === "full_post_sync");
}

export async function resolveRecurringReplayPipeline(householdId: string) {
  return findActiveRecurringReplay(householdId);
}

export async function pipelineHeartbeat(
  runId: string,
  patch: Parameters<typeof heartbeatPipelineRun>[1],
) {
  return heartbeatPipelineRun(runId, { status: "running", ...patch });
}

export async function pipelineAdvancePhase(runId: string, phase: PipelinePhase) {
  const run = await advancePipelinePhase(runId, phase);
  if (run) {
    await recordPhaseStarted(runId, run.householdId, phase);
  }
  return run;
}

export async function pipelineComplete(
  runId: string,
  householdId: string,
) {
  await appendPipelineActivityEvents([
    {
      pipelineRunId: runId,
      householdId,
      kind: "phase_completed",
      payload: { phase: "done" },
    },
  ]);

  return completePipelineRun(runId);
}

export async function pipelineFail(runId: string, message: string) {
  return failPipelineRun(runId, message);
}

export async function recordSyncProgress(
  runId: string,
  importedAccounts: number,
  importedTransactions: number,
  extras?: { currentAccountName?: string; status?: "running" | "rate_limited" },
) {
  return setPipelineCountersFromSync(
    runId,
    importedAccounts,
    importedTransactions,
    extras,
  );
}

export async function recordCategorizePageProgress(
  runId: string,
  householdId: string,
  result: {
    updated: number;
    scanned: number;
    sampleTransactionIds?: string[];
  },
) {
  await pipelineHeartbeat(runId, {
    currentPhase: "categorize",
    counters: { categorized: result.updated },
    phaseProgress: { lastStepId: `categorize-${result.scanned}` },
  });

  if (result.updated > 0) {
    await appendPipelineActivityEvents(
      batchCategorizedActivity({
        pipelineRunId: runId,
        householdId,
        sampleIds: result.sampleTransactionIds ?? [],
        total: result.updated,
      }),
    );
  }
}

export async function recordLinkPageProgress(
  runId: string,
  householdId: string,
  linkedCount: number,
) {
  await pipelineHeartbeat(runId, {
    currentPhase: "link",
    counters: { linkedPairs: linkedCount },
  });

  if (linkedCount > 0) {
    await appendPipelineActivityEvents([
      batchLinkedActivity({
        pipelineRunId: runId,
        householdId,
        pairCount: linkedCount,
      }),
    ]);
  }
}

export async function recordRecurringProgress(
  runId: string,
  delta: {
    billsCreated?: number;
    billsUpdated?: number;
    billsFlagged?: number;
  },
) {
  return pipelineHeartbeat(runId, {
    currentPhase: "recurring",
    counters: delta,
  });
}

export async function completeHouseholdPipelineChains(
  householdId: string,
  options?: { kinds: Array<"full_post_sync" | "recurring_replay"> },
) {
  const { findActiveRunsForHousehold } = await import(
    "@/lib/ingestion/pipeline/runs"
  );
  const runs = await findActiveRunsForHousehold(householdId);
  const allowed = new Set(
    options?.kinds ?? (["full_post_sync", "recurring_replay"] as const),
  );

  for (const run of runs) {
    if (!allowed.has(run.kind as "full_post_sync" | "recurring_replay")) {
      continue;
    }

    if (
      run.kind === "full_post_sync" &&
      run.currentPhase !== "recurring" &&
      run.currentPhase !== "done"
    ) {
      continue;
    }

    await pipelineComplete(run.id, householdId);
  }
}

export async function recordImportBatch(
  runId: string,
  householdId: string,
  count: number,
  accountName?: string,
) {
  await pipelineHeartbeat(runId, {
    currentPhase: "sync",
    counters: { importedTransactions: count },
  });

  if (count > 0) {
    await appendPipelineActivityEvents([
      batchImportedActivity({
        pipelineRunId: runId,
        householdId,
        count,
        accountName,
      }),
    ]);
  }
}
