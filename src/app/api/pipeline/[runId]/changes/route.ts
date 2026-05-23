import { NextResponse } from "next/server";
import { z } from "zod";

import {
  fetchTransactionDeltas,
  parseChangeCursor,
} from "@/lib/ingestion/pipeline/deltas";
import { getPipelineRunById } from "@/lib/ingestion/pipeline/runs";
import { withApiHandler } from "@/lib/errors/api";
import { notFoundError } from "@/lib/errors/catalog";
import { getActiveHousehold } from "@/lib/finance/household";

const querySchema = z.object({
  since: z.string().optional(),
  sinceId: z.string().optional(),
  accountId: z.string().optional(),
});

export const GET = withApiHandler(
  "pipeline.changes",
  async (request: Request, { params }: { params: Promise<{ runId: string }> }) => {
    const { runId } = await params;
    const household = await getActiveHousehold();
    const run = await getPipelineRunById(runId, household.householdId);

    if (!run) {
      throw notFoundError("Pipeline run not found.", { runId });
    }

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      since: searchParams.get("since") ?? undefined,
      sinceId: searchParams.get("sinceId") ?? undefined,
      accountId: searchParams.get("accountId") ?? undefined,
    });

    const since = parsed.success ? parsed.data.since : undefined;
    const sinceId = parsed.success ? parsed.data.sinceId : undefined;
    const accountId = parsed.success ? parsed.data.accountId : undefined;
    const cursor = parseChangeCursor(since ?? null, sinceId ?? null);

    const delta = await fetchTransactionDeltas(
      household.householdId,
      cursor,
      { accountId },
    );

    return NextResponse.json({
      transactions: delta.transactions,
      nextCursor: delta.nextCursor,
      overflow: delta.overflow,
    });
  },
);
