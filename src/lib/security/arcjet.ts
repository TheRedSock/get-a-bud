import arcjet, { fixedWindow } from "@arcjet/next";

import { serverEnv } from "@/config/env";

/**
 * Base Arcjet client. Individual routes add rules via `.withRule()`.
 * When `ARCJET_KEY` is absent (local development), Arcjet silently allows
 * all requests through its default fail-open behavior.
 */
const aj = arcjet({
  key: serverEnv.ARCJET_KEY ?? "",
  rules: [],
});

// --- Public / Unauthenticated ---

/** ~5 requests per minute per IP — for registration. */
export const registerRateLimit = aj.withRule(
  fixedWindow({ mode: "LIVE", max: 5, window: "60s" }),
);

/** ~10 requests per minute per IP — for authentication. */
export const authRateLimit = aj.withRule(
  fixedWindow({ mode: "LIVE", max: 10, window: "60s" }),
);

/** ~3 requests per minute per IP — for bank integration auth. */
export const integrationAuthRateLimit = aj.withRule(
  fixedWindow({ mode: "LIVE", max: 3, window: "60s" }),
);

// --- Authenticated mutations ---

/** ~30 requests per minute per IP — standard authenticated mutations. */
export const authenticatedMutationRateLimit = aj.withRule(
  fixedWindow({ mode: "LIVE", max: 30, window: "60s" }),
);

/** ~5 requests per minute per IP — bulk operations (approve-all, etc.). */
export const bulkOperationRateLimit = aj.withRule(
  fixedWindow({ mode: "LIVE", max: 5, window: "60s" }),
);

/** ~10 requests per minute per IP — queue/job enqueue triggers. */
export const queueEnqueueRateLimit = aj.withRule(
  fixedWindow({ mode: "LIVE", max: 10, window: "60s" }),
);
