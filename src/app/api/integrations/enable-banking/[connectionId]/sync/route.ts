import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { ingestionConnections } from "@/db/schema";
import { inngest } from "@/inngest/client";
import { getActiveHousehold } from "@/lib/finance/household";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const { connectionId } = await params;
  const household = await getActiveHousehold();

  const [connection] = await db
    .select({ id: ingestionConnections.id })
    .from(ingestionConnections)
    .where(
      and(
        eq(ingestionConnections.id, connectionId),
        eq(ingestionConnections.householdId, household.householdId),
      ),
    )
    .limit(1);

  if (!connection) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  await inngest.send({
    name: "bank.connection.sync",
    data: { connectionId },
  });

  return NextResponse.json({ queued: true });
}
