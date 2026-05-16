import { Inngest } from "inngest";

/**
 * Determine the Inngest environment for branch routing.
 *
 * - Local dev: Uses INNGEST_ENV from .env.local (typically "development")
 * - Vercel Preview: Uses the git branch name (e.g. "dev") as branch environment
 * - Vercel Production: Returns undefined → routes to Inngest's production env
 *
 * The SDK docs claim auto-detection from VERCEL_GIT_COMMIT_REF, but in
 * practice this does not work reliably with the Vercel integration.
 * Setting `env` explicitly ensures correct routing.
 */
function resolveInngestEnv(): string | undefined {
  // Explicit override takes priority (local dev with INNGEST_ENV="development")
  if (process.env.INNGEST_ENV) {
    return process.env.INNGEST_ENV;
  }

  // On Vercel Preview, use the git branch as the branch environment name
  if (
    process.env.VERCEL_ENV === "preview" &&
    process.env.VERCEL_GIT_COMMIT_REF
  ) {
    return process.env.VERCEL_GIT_COMMIT_REF;
  }

  // Production or unknown: undefined means Inngest default (production)
  return undefined;
}

export const inngest = new Inngest({
  id: "get-a-bud",
  name: "Get a Bud",
  eventKey: process.env.INNGEST_EVENT_KEY,
  env: resolveInngestEnv(),
});
