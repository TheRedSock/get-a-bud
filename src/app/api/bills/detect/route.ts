import { NextResponse } from "next/server";

import { inngest } from "@/inngest/client";
import { withApiHandler } from "@/lib/errors/api";
import { getActiveHousehold } from "@/lib/finance/household";

export const POST = withApiHandler("bills.detect-recurring", async () => {
  const household = await getActiveHousehold();

  await inngest.send({
    name: "transactions.recurring.detect",
    data: { householdId: household.householdId },
  });

  return NextResponse.json({ queued: true });
});
