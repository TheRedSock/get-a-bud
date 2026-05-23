import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { pipelineActivityEvents } from "@/db/schema";
import {
  getPipelineRunById,
  loadConnectionDisplayNames,
} from "@/lib/ingestion/pipeline/runs";
import { serializePipelineRun } from "@/lib/ingestion/pipeline/serialize";
import { withApiHandler } from "@/lib/errors/api";
import { notFoundError } from "@/lib/errors/catalog";
import { getActiveHousehold } from "@/lib/finance/household";

export const GET = withApiHandler(
  "pipeline.run.get",
  async (request: Request, { params }: { params: Promise<{ runId: string }> }) => {
    const { runId } = await params;
    const household = await getActiveHousehold();
    const run = await getPipelineRunById(runId, household.householdId);

    if (!run) {
      throw notFoundError("Pipeline run not found.", { runId });
    }

    const displayNames = run.connectionId
      ? await loadConnectionDisplayNames([run.connectionId])
      : new Map<string, string>();

    const { searchParams } = new URL(request.url);
    const before = searchParams.get("before");

    const activities = await db
      .select({
        id: pipelineActivityEvents.id,
        kind: pipelineActivityEvents.kind,
        entityType: pipelineActivityEvents.entityType,
        entityId: pipelineActivityEvents.entityId,
        payload: pipelineActivityEvents.payload,
        occurredAt: pipelineActivityEvents.occurredAt,
      })
      .from(pipelineActivityEvents)
      .where(eq(pipelineActivityEvents.pipelineRunId, runId))
      .orderBy(desc(pipelineActivityEvents.occurredAt))
      .limit(50);

    const filtered = before
      ? activities.filter((a) => a.occurredAt.toISOString() < before)
      : activities;

    return NextResponse.json({
      run: serializePipelineRun(
        run,
        run.connectionId
          ? (displayNames.get(run.connectionId) ?? null)
          : null,
      ),
      activities: filtered.map((a) => ({
        id: a.id,
        kind: a.kind,
        entityType: a.entityType,
        entityId: a.entityId,
        payload: a.payload,
        occurredAt: a.occurredAt.toISOString(),
      })),
    });
  },
);
