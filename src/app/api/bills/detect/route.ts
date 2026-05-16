import { NextResponse } from "next/server";

import { inngest } from "@/inngest/client";
import { withApiHandler } from "@/lib/errors/api";
import { rateLimitedError } from "@/lib/errors/catalog";
import { getActiveHousehold } from "@/lib/finance/household";
import { queueEnqueueRateLimit } from "@/lib/security/arcjet";

export const POST = withApiHandler("bills.detect-recurring", async (request) => {
  const decision = await queueEnqueueRateLimit.protect(request);
  if (decision.isDenied()) {
    throw rateLimitedError("Too many detection requests. Please try again shortly.");
  }

  const household = await getActiveHousehold();

  await inngest.send({
    name: "transactions.recurring.detect",
    data: { householdId: household.householdId },
  });

  return NextResponse.json({ queued: true });
});
