import { and, eq, gt, isNotNull, isNull, lte, or } from "drizzle-orm";
import { cron } from "inngest";

import { db } from "@/db";
import { ingestionConnections } from "@/db/schema";
import { inngest } from "@/inngest/client";
import { EVENT_NAMES } from "@/inngest/lib/events";
import { sendValidatedStepEvent } from "@/inngest/lib/send-event";
import {
  findActiveSyncRunsByConnectionIds,
  resolveSyncRunForEnqueue,
} from "@/lib/ingestion/sync-runs";
import { logger } from "@/lib/logger";

/** Cron-triggered job; no event payload to validate. */
export const scheduledBankSync = inngest.createFunction(
  {
    id: "scheduled-bank-sync",
    name: "Scheduled bank sync",
    triggers: cron("0 */6 * * *"),
  },
  async ({ step }) => {
    const now = new Date();
    const connections = await step.run("load-active-connections", () =>
      db
        .select({ id: ingestionConnections.id })
        .from(ingestionConnections)
        .where(
          and(
            eq(ingestionConnections.provider, "enable_banking"),
            eq(ingestionConnections.status, "connected"),
            isNotNull(ingestionConnections.consentSessionId),
            or(
              isNull(ingestionConnections.consentExpiresAt),
              gt(ingestionConnections.consentExpiresAt, now),
            ),
            or(
              isNull(ingestionConnections.rateLimitedUntil),
              lte(ingestionConnections.rateLimitedUntil, now),
            ),
          ),
        ),
    );

    const activeRunEntries = await step.run("load-active-sync-runs", () =>
      findActiveSyncRunsByConnectionIds(connections.map((c) => c.id)).then(
        (runs) => [...runs.entries()],
      ),
    );
    const activeRunsByConnection = new Map(activeRunEntries);

    let queued = 0;
    let skipped = 0;

    for (const connection of connections) {
      const active = activeRunsByConnection.get(connection.id);
      if (
        active &&
        (active.status === "running" || active.status === "queued")
      ) {
        logger.warn("scheduled_bank_sync.skipped_active_run", {
          connectionId: connection.id,
          runId: active.id,
          status: active.status,
        });
        skipped += 1;
        continue;
      }

      const run =
        active ??
        (await resolveSyncRunForEnqueue({ connectionId: connection.id }));

      await sendValidatedStepEvent(
        step,
        `sync-${connection.id}`,
        EVENT_NAMES.bankConnectionSync,
        { connectionId: connection.id, runId: run.id },
      );
      queued += 1;
    }

    return { queued, skipped };
  },
);
