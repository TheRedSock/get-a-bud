import { Inngest } from "inngest";

/**
 * Inngest client instance.
 *
 * Environment routing:
 * - On Vercel, the SDK auto-detects the branch from VERCEL_GIT_COMMIT_REF.
 *   Do NOT set INNGEST_ENV in Vercel — it overrides auto-detection.
 * - Locally, set INNGEST_ENV="development" in .env.local for the Dev Server.
 * - All branch environments share the same INNGEST_EVENT_KEY and
 *   INNGEST_SIGNING_KEY. Routing is handled by environment detection, not keys.
 */
export const inngest = new Inngest({
  id: "get-a-bud",
  name: "Get a Bud",
  eventKey: process.env.INNGEST_EVENT_KEY,
});
