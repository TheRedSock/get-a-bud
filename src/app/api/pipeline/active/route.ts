import { NextResponse } from "next/server";

import {
  findActiveRunsForHousehold,
  loadConnectionDisplayNames,
} from "@/lib/ingestion/pipeline/runs";
import { serializePipelineRun } from "@/lib/ingestion/pipeline/serialize";
import { withApiHandler } from "@/lib/errors/api";
import { getActiveHousehold } from "@/lib/finance/household";

export const GET = withApiHandler("pipeline.active", async () => {
  const household = await getActiveHousehold();
  const runs = await findActiveRunsForHousehold(household.householdId);

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
