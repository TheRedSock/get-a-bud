import arcjet, { fixedWindow } from "@arcjet/next";
import { headers } from "next/headers";

import { serverEnv } from "@/config/env";
import { rateLimitedError } from "@/lib/errors/catalog";

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

// --- Server Action helpers ---

/**
 * Enforce a rate limit inside a Server Action.
 *
 * Uses `next/headers` to construct a request-like object. If the request is
 * denied, throws a `rateLimitedError` from the error catalog. The error
 * will be caught by the `authenticatedAction` wrapper and returned to the
 * client as a typed error.
 *
 * Usage:
 * ```ts
 * await enforceActionRateLimit(bulkOperationRateLimit, userId);
 * ```
 */
export async function enforceActionRateLimit(
  limiter: ReturnType<typeof aj.withRule>,
  userId?: string,
  options?: { headers?: Headers },
): Promise<void> {
  const headersList = options?.headers ?? (await headers());
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "127.0.0.1";

  // Construct a minimal request for Arcjet's protect() method
  const requestHeaders = new Headers(headersList);
  if (userId) {
    requestHeaders.set("x-user-id", userId);
  }
  const request = new Request("http://localhost/action", {
    headers: requestHeaders,
  });
  // Set ip property for Arcjet
  Object.defineProperty(request, "ip", { value: ip });

  const decision = await limiter.protect(request);

  if (decision.isDenied()) {
    throw rateLimitedError(
      "Too many requests. Please wait a moment and try again.",
    );
  }
}
