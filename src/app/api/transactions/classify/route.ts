import { NextResponse } from "next/server";

import { inngest } from "@/inngest/client";
import { withApiHandler } from "@/lib/errors/api";
import { getActiveHousehold } from "@/lib/finance/household";

export const POST = withApiHandler("transactions.classify", async () => {
  const household = await getActiveHousehold();

  await inngest.send({
    name: "transactions.categorize",
    data: { householdId: household.householdId },
  });

  return NextResponse.json({ queued: true });
});
