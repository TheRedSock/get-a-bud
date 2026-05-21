import { eq } from "drizzle-orm";

import { db } from "@/db";
import { ingestionConnections, syncRuns } from "@/db/schema";
import { inngest } from "@/inngest/client";
import {
  bankConnectionSyncSchema,
  parseJobEvent,
} from "@/inngest/lib/event-validation";
import { bankConnectionSyncEvent, EVENT_NAMES } from "@/inngest/lib/events";
import { sendValidatedStepEvent } from "@/inngest/lib/send-event";
import { unexpectedError } from "@/lib/errors/catalog";
import { syncEnableBankingConnection } from "@/lib/ingestion/enable-banking/sync";
import { prepareSyncRun } from "@/lib/ingestion/sync-runs";
import { logger } from "@/lib/logger";

export const syncBankConnection = inngest.createFunction(
  {
    id: "sync-bank-connection",
    name: "Sync bank connection",
    triggers: bankConnectionSyncEvent,
  },
  async ({ event, step }) => {
    const { connectionId, runId } = parseJobEvent(
      bankConnectionSyncSchema,
      event.data,
      { eventName: EVENT_NAMES.bankConnectionSync },
    );

    const run = await step.run("prepare-sync-run", () =>
      prepareSyncRun({ connectionId, runId }),
    );

    try {
      const result = await step.run("sync-enable-banking", () =>
        syncEnableBankingConnection(connectionId, { syncRunId: run.id }),
      );

      if (result.continuationRequired) {
        await step.run("checkpoint-sync-run", () =>
          db
            .update(syncRuns)
            .set({
              status: "running",
              finishedAt: null,
              importedAccounts:
                result.progress?.importedAccounts ?? result.accounts.length,
              importedTransactions:
                result.progress?.importedTransactions ??
                result.transactions.length,
            })
            .where(eq(syncRuns.id, run.id)),
        );

        await sendValidatedStepEvent(
          step,
          "continue-bank-sync",
          EVENT_NAMES.bankConnectionSync,
          { connectionId, runId: run.id },
        );

        return result;
      }

      if (result.rateLimitedUntil) {
        await step.run("pause-rate-limited-sync-run", () =>
          db
            .update(syncRuns)
            .set({
              status: "rate_limited",
              finishedAt: null,
              importedAccounts:
                result.progress?.importedAccounts ?? result.accounts.length,
              importedTransactions:
                result.progress?.importedTransactions ??
                result.transactions.length,
            })
            .where(eq(syncRuns.id, run.id)),
        );

        await step.sleepUntil(
          "wait-for-bank-rate-limit",
          result.rateLimitedUntil,
        );
        await sendValidatedStepEvent(
          step,
          "retry-rate-limited-sync",
          EVENT_NAMES.bankConnectionSync,
          { connectionId, runId: run.id },
        );

        return result;
      }

      await step.run("finish-sync-run", () =>
        db
          .update(syncRuns)
          .set({
            status: "succeeded",
            finishedAt: new Date(),
            importedAccounts:
              result.progress?.importedAccounts ?? result.accounts.length,
            importedTransactions:
              result.progress?.importedTransactions ??
              result.transactions.length,
          })
          .where(eq(syncRuns.id, run.id)),
      );

      const [conn] = await step.run("load-connection-household", () =>
        db
          .select({ householdId: ingestionConnections.householdId })
          .from(ingestionConnections)
          .where(eq(ingestionConnections.id, connectionId))
          .limit(1),
      );

      if (conn) {
        await sendValidatedStepEvent(
          step,
          "categorize-imported-transactions",
          EVENT_NAMES.categorizeTransactions,
          { connectionId, householdId: conn.householdId },
        );
      }

      return result;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown bank sync error";

      await step.run("fail-sync-run", () =>
        db
          .update(syncRuns)
          .set({
            status: "failed",
            finishedAt: new Date(),
            errorMessage: message,
          })
          .where(eq(syncRuns.id, run.id)),
      );

      logger.exception(
        unexpectedError(error, {
          operation: "inngest.syncBankConnection",
          connectionId,
          runId: run.id,
        }),
      );

      throw error;
    }
  },
);
