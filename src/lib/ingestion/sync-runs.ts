import { and, desc, eq, inArray } from "drizzle-orm";
import { NonRetriableError } from "inngest";

import { db } from "@/db";
import { syncRuns } from "@/db/schema";

const ACTIVE_SYNC_STATUSES = ["queued", "running", "rate_limited"] as const;

export type SyncRunRow = typeof syncRuns.$inferSelect;

export async function findActiveSyncRun(
  connectionId: string,
): Promise<SyncRunRow | undefined> {
  const [run] = await db
    .select()
    .from(syncRuns)
    .where(
      and(
        eq(syncRuns.connectionId, connectionId),
        inArray(syncRuns.status, [...ACTIVE_SYNC_STATUSES]),
      ),
    )
    .orderBy(desc(syncRuns.startedAt))
    .limit(1);

  return run;
}

export async function createSyncRun(connectionId: string): Promise<SyncRunRow> {
  const [run] = await db
    .insert(syncRuns)
    .values({
      connectionId,
      provider: "enable_banking",
      status: "queued",
    })
    .returning();

  return run;
}

/**
 * Resolves the sync run to use when enqueueing or starting a bank sync.
 * Reuses an in-flight run when none is specified; validates explicit runId.
 */
export async function resolveSyncRunForEnqueue(input: {
  connectionId: string;
  runId?: string;
}): Promise<SyncRunRow> {
  if (input.runId) {
    const [run] = await db
      .select()
      .from(syncRuns)
      .where(eq(syncRuns.id, input.runId))
      .limit(1);

    if (!run || run.connectionId !== input.connectionId) {
      throw new NonRetriableError(
        `Sync run ${input.runId} was not found for connection ${input.connectionId}`,
      );
    }

    return run;
  }

  const active = await findActiveSyncRun(input.connectionId);
  if (active) {
    return active;
  }

  return createSyncRun(input.connectionId);
}

/**
 * Latest active sync run per connection id (queued, running, or rate_limited).
 */
export async function findActiveSyncRunsByConnectionIds(
  connectionIds: string[],
): Promise<Map<string, SyncRunRow>> {
  if (connectionIds.length === 0) {
    return new Map();
  }

  const runs = await db
    .select()
    .from(syncRuns)
    .where(
      and(
        inArray(syncRuns.connectionId, connectionIds),
        inArray(syncRuns.status, [...ACTIVE_SYNC_STATUSES]),
      ),
    )
    .orderBy(desc(syncRuns.startedAt));

  const byConnection = new Map<string, SyncRunRow>();
  for (const run of runs) {
    if (!run.connectionId) continue;
    if (!byConnection.has(run.connectionId)) {
      byConnection.set(run.connectionId, run);
    }
  }

  return byConnection;
}

/** Marks a resolved sync run as running before provider work begins. */
export async function prepareSyncRun(input: {
  connectionId: string;
  runId?: string;
}) {
  const run = await resolveSyncRunForEnqueue(input);

  const [updatedRun] = await db
    .update(syncRuns)
    .set({
      status: "running",
      startedAt: new Date(),
      finishedAt: null,
      errorCode: null,
      errorMessage: null,
    })
    .where(eq(syncRuns.id, run.id))
    .returning();

  return updatedRun;
}
