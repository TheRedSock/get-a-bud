import { NextResponse } from "next/server";

import { inngest } from "@/inngest/client";
import { withApiHandler } from "@/lib/errors/api";
import { rateLimitedError } from "@/lib/errors/catalog";
import { getActiveHousehold } from "@/lib/finance/household";
import { queueEnqueueRateLimit } from "@/lib/security/arcjet";

export const POST = withApiHandler("transactions.classify", async (request) => {
  const decision = await queueEnqueueRateLimit.protect(request);
  if (decision.isDenied()) {
    throw rateLimitedError("Too many classification requests. Please try again shortly.");
  }

  const household = await getActiveHousehold();

  await inngest.send({
    name: "transactions.categorize",
    data: { householdId: household.householdId },
  });

  return NextResponse.json({ queued: true });
});
