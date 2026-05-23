import { count, eq } from "drizzle-orm";

import { db } from "@/db";
import { pipelineActivityEvents } from "@/db/schema";
import { logger } from "@/lib/logger";

export const MAX_ACTIVITY_EVENTS_PER_STEP = 10;
export const MAX_ACTIVITY_EVENTS_PER_RUN = 200;
export const MAX_SAMPLE_IDS_PER_STEP = 10;
export const ACTIVITY_RETENTION_DAYS = 7;

type ActivityInsert = {
  pipelineRunId: string;
  householdId: string;
  kind: (typeof pipelineActivityEvents.$inferInsert)["kind"];
  entityType?: string;
  entityId?: string;
  payload?: Record<string, unknown>;
};

export async function countActivityEventsForRun(
  pipelineRunId: string,
): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(pipelineActivityEvents)
    .where(eq(pipelineActivityEvents.pipelineRunId, pipelineRunId));

  return Number(row?.total ?? 0);
}

export async function appendPipelineActivityEvents(
  events: ActivityInsert[],
): Promise<void> {
  if (events.length === 0) return;

  const runId = events[0]!.pipelineRunId;
  const existing = await countActivityEventsForRun(runId);
  if (existing >= MAX_ACTIVITY_EVENTS_PER_RUN) {
    logger.info("Pipeline activity event cap reached, skipping inserts", {
      pipelineRunId: runId,
      existing,
    });
    return;
  }

  const room = MAX_ACTIVITY_EVENTS_PER_RUN - existing;
  const batch = events.slice(0, Math.min(events.length, MAX_ACTIVITY_EVENTS_PER_STEP, room));

  if (batch.length === 0) return;

  await db.insert(pipelineActivityEvents).values(batch);
}

export function batchImportedActivity(input: {
  pipelineRunId: string;
  householdId: string;
  count: number;
  accountName?: string;
}): ActivityInsert {
  return {
    pipelineRunId: input.pipelineRunId,
    householdId: input.householdId,
    kind: "transaction_imported",
    payload: {
      count: input.count,
      accountName: input.accountName,
      message: `${input.count} transaction${input.count === 1 ? "" : "s"} imported${
        input.accountName ? ` · ${input.accountName}` : ""
      }`,
    },
  };
}

export function batchCategorizedActivity(input: {
  pipelineRunId: string;
  householdId: string;
  sampleIds: string[];
  total: number;
}): ActivityInsert[] {
  const events: ActivityInsert[] = input.sampleIds
    .slice(0, MAX_SAMPLE_IDS_PER_STEP)
    .map((id) => ({
      pipelineRunId: input.pipelineRunId,
      householdId: input.householdId,
      kind: "transaction_categorized" as const,
      entityType: "transaction",
      entityId: id,
    }));

  const remainder = input.total - input.sampleIds.length;
  if (remainder > 0 || input.total > MAX_SAMPLE_IDS_PER_STEP) {
    const andMore = Math.max(0, input.total - Math.min(input.sampleIds.length, MAX_SAMPLE_IDS_PER_STEP));
    if (andMore > 0) {
      events.push({
        pipelineRunId: input.pipelineRunId,
        householdId: input.householdId,
        kind: "transaction_categorized",
        payload: { aggregate: true, count: andMore, message: `and ${andMore} more categorized` },
      });
    }
  }

  return events.slice(0, MAX_ACTIVITY_EVENTS_PER_STEP);
}

export function batchLinkedActivity(input: {
  pipelineRunId: string;
  householdId: string;
  pairCount: number;
}): ActivityInsert {
  return {
    pipelineRunId: input.pipelineRunId,
    householdId: input.householdId,
    kind: "transfer_linked",
    payload: {
      count: input.pairCount,
      message: `${input.pairCount} transfer pair${input.pairCount === 1 ? "" : "s"} linked`,
    },
  };
}

export async function recordPhaseStarted(
  pipelineRunId: string,
  householdId: string,
  phase: string,
) {
  await appendPipelineActivityEvents([
    {
      pipelineRunId,
      householdId,
      kind: "phase_started",
      payload: { phase },
    },
  ]);
}
