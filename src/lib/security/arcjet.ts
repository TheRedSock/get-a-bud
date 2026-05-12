import arcjet, { fixedWindow } from "@arcjet/next";

/**
 * Base Arcjet client. Individual routes add rules via `.withRule()`.
 * When `ARCJET_KEY` is absent (local development), Arcjet silently allows
 * all requests through its default fail-open behavior.
 */
const aj = arcjet({
  key: process.env.ARCJET_KEY!,
  rules: [],
});

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
