import { NextResponse } from "next/server";

import {
  findActiveRunsForHousehold,
  loadConnectionDisplayNames,
  markStalePipelineRunsFailed,
} from "@/lib/ingestion/pipeline/runs";
import { serializePipelineRun } from "@/lib/ingestion/pipeline/serialize";
import { withApiHandler } from "@/lib/errors/api";
import { getActiveHousehold } from "@/lib/finance/household";
import { STALE_FAIL_MS } from "@/lib/ingestion/pipeline/types";

export const GET = withApiHandler("pipeline.active", async () => {
  const household = await getActiveHousehold();
  const runs = await findActiveRunsForHousehold(household.householdId);

  // Self-healing: if any active run has a heartbeat older than the hard
  // threshold (15 min), mark it failed inline. This ensures stale runs
  // don't poll forever even when the maintenance cron isn't running
  // (e.g. local dev, Inngest outage).
  const now = Date.now();
  const hasStaleRun = runs.some(
    (r) => now - r.lastHeartbeatAt.getTime() > STALE_FAIL_MS,
  );
  if (hasStaleRun) {
    await markStalePipelineRunsFailed();
    // Re-fetch after cleanup to return only genuinely active runs.
    const freshRuns = await findActiveRunsForHousehold(household.householdId);
    const connectionIds = freshRuns
      .map((r) => r.connectionId)
      .filter((id): id is string => Boolean(id));
    const displayNames = await loadConnectionDisplayNames(connectionIds);

    return NextResponse.json({
      runs: freshRuns.map((run) =>
        serializePipelineRun(
          run,
          run.connectionId
            ? (displayNames.get(run.connectionId) ?? null)
            : null,
        ),
      ),
    });
  }

  const connectionIds = runs
    .map((r) => r.connectionId)
    .filter((id): id is string => Boolean(id));

  const displayNames = await loadConnectionDisplayNames(connectionIds);

  return NextResponse.json({
    runs: runs.map((run) =>
      serializePipelineRun(
        run,
        run.connectionId ? (displayNames.get(run.connectionId) ?? null) : null,
      ),
    ),
  });
});
