import { Inngest } from "inngest";

/**
 * Inngest client instance.
 *
 * Environment routing requires INNGEST_ENV to be set as a Vercel env var
 * (Preview scope only, value "dev") for the Vercel integration to sync
 * preview deploys to a branch environment. The SDK's auto-detection from
 * VERCEL_GIT_COMMIT_REF does NOT influence the integration's sync routing.
 *
 * Locally, set INNGEST_ENV="development" in .env.local for the Dev Server.
 * All branch environments share the same INNGEST_EVENT_KEY/SIGNING_KEY.
 */
export const inngest = new Inngest({
  id: "get-a-bud",
  name: "Get a Bud",
  eventKey: process.env.INNGEST_EVENT_KEY,
});
