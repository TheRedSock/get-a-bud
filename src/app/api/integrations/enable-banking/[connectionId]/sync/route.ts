import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { ingestionConnections, syncRuns } from "@/db/schema";
import { inngest } from "@/inngest/client";
import { withApiHandler } from "@/lib/errors/api";
import { notFoundError, providerError, validationError } from "@/lib/errors/catalog";
import { getActiveHousehold } from "@/lib/finance/household";

function serializeRun(run: typeof syncRuns.$inferSelect) {
  return {
    id: run.id,
    connectionId: run.connectionId,
    status: run.status,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    importedAccounts: run.importedAccounts,
    importedTransactions: run.importedTransactions,
    errorCode: run.errorCode,
    errorMessage: run.errorMessage,
  };
}

async function getConnectionForHousehold(connectionId: string) {
  const household = await getActiveHousehold();

  const [connection] = await db
    .select({
      id: ingestionConnections.id,
      consentSessionId: ingestionConnections.consentSessionId,
    })
    .from(ingestionConnections)
    .where(
      and(
        eq(ingestionConnections.id, connectionId),
        eq(ingestionConnections.householdId, household.householdId),
      ),
    )
    .limit(1);

  return connection;
}

export const POST = withApiHandler(
  "enableBanking.sync.queue",
  async (
    _request: Request,
    { params }: { params: Promise<{ connectionId: string }> },
  ) => {
  const { connectionId } = await params;
  const connection = await getConnectionForHousehold(connectionId);

  if (!connection) {
    throw notFoundError("Enable Banking connection not found.", { connectionId });
  }

  if (!connection.consentSessionId) {
    throw validationError("Bank authorization is not complete yet.", {
      fieldErrors: {
        connection: ["Finish bank authorization before starting a sync."],
      },
      context: { connectionId },
    });
  }

  const [run] = await db
    .insert(syncRuns)
    .values({
      connectionId,
      provider: "enable_banking",
      status: "queued",
    })
    .returning();

  try {
    await inngest.send({
      name: "bank.connection.sync",
      data: { connectionId, runId: run.id },
    });

    return NextResponse.json({ run: serializeRun(run) }, { status: 202 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not queue bank sync";

    await db
      .update(syncRuns)
      .set({
        status: "failed",
        finishedAt: new Date(),
        errorMessage: message,
      })
      .where(eq(syncRuns.id, run.id));

    throw providerError(message, {
      cause: error,
      userMessage:
        "The bank sync could not be queued. Please try again in a moment.",
      context: { connectionId, runId: run.id },
      status: 500,
    });
  }
  },
);

export const GET = withApiHandler(
  "enableBanking.sync.get",
  async (
    request: Request,
    { params }: { params: Promise<{ connectionId: string }> },
  ) => {
  const { connectionId } = await params;
  const connection = await getConnectionForHousehold(connectionId);

  if (!connection) {
    throw notFoundError("Enable Banking connection not found.", { connectionId });
  }

  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("runId");
  const [run] = await db
    .select()
    .from(syncRuns)
    .where(
      runId
        ? and(eq(syncRuns.connectionId, connectionId), eq(syncRuns.id, runId))
        : eq(syncRuns.connectionId, connectionId),
    )
    .orderBy(desc(syncRuns.startedAt))
    .limit(1);

  if (!run) {
    return NextResponse.json({ run: null });
  }

  return NextResponse.json({ run: serializeRun(run) });
  },
);
