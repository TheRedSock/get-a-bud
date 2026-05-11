import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { ingestionConnections, syncRuns } from "@/db/schema";
import { inngest } from "@/inngest/client";
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

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const { connectionId } = await params;
  const connection = await getConnectionForHousehold(connectionId);

  if (!connection) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  if (!connection.consentSessionId) {
    return NextResponse.json(
      { error: "Bank authorization is not complete yet" },
      { status: 409 },
    );
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

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const { connectionId } = await params;
  const connection = await getConnectionForHousehold(connectionId);

  if (!connection) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
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
}
