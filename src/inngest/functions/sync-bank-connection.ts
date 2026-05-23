import { eq } from "drizzle-orm";

import { db } from "@/db";
import { ingestionConnections, syncRuns } from "@/db/schema";
import { inngest } from "@/inngest/client";
import {
  bankConnectionSyncSchema,
  parseJobEvent,
} from "@/inngest/lib/event-validation";
import { bankConnectionSyncEvent, EVENT_NAMES } from "@/inngest/lib/events";
import {
  ensureFullPostSyncPipeline,
  pipelineAdvancePhase,
  pipelineFail,
  recordSyncProgress,
} from "@/inngest/lib/pipeline-progress";
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

    const pipelineCtx = await step.run("prepare-pipeline-run", async () => {
      const [conn] = await db
        .select({ householdId: ingestionConnections.householdId })
        .from(ingestionConnections)
        .where(eq(ingestionConnections.id, connectionId))
        .limit(1);

      if (!conn) {
        return null;
      }

      const pipeline = await ensureFullPostSyncPipeline({
        householdId: conn.householdId,
        connectionId,
        syncRunId: run.id,
      });

      await recordSyncProgress(
        pipeline.id,
        run.importedAccounts,
        run.importedTransactions,
        { status: "running" },
      );

      return { pipelineId: pipeline.id, householdId: conn.householdId };
    });

    try {
      const result = await step.run("sync-enable-banking", () =>
        syncEnableBankingConnection(connectionId, { syncRunId: run.id }),
      );

      const importedAccounts =
        result.progress?.importedAccounts ?? result.accounts.length;
      const importedTransactions =
        result.progress?.importedTransactions ?? result.transactions.length;

      if (result.continuationRequired) {
        await step.run("checkpoint-sync-run", async () => {
          await db
            .update(syncRuns)
            .set({
              status: "running",
              finishedAt: null,
              importedAccounts,
              importedTransactions,
            })
            .where(eq(syncRuns.id, run.id));

          if (pipelineCtx) {
            await recordSyncProgress(
              pipelineCtx.pipelineId,
              importedAccounts,
              importedTransactions,
              {
                currentAccountName: result.progress?.currentAccountName,
                status: "running",
              },
            );
          }
        });

        await sendValidatedStepEvent(
          step,
          "continue-bank-sync",
          EVENT_NAMES.bankConnectionSync,
          { connectionId, runId: run.id },
        );

        return result;
      }

      if (result.rateLimitedUntil) {
        await step.run("pause-rate-limited-sync-run", async () => {
          await db
            .update(syncRuns)
            .set({
              status: "rate_limited",
              finishedAt: null,
              importedAccounts,
              importedTransactions,
            })
            .where(eq(syncRuns.id, run.id));

          if (pipelineCtx) {
            await recordSyncProgress(
              pipelineCtx.pipelineId,
              importedAccounts,
              importedTransactions,
              { status: "rate_limited" },
            );
          }
        });

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

      await step.run("finish-sync-run", async () => {
        await db
          .update(syncRuns)
          .set({
            status: "succeeded",
            finishedAt: new Date(),
            importedAccounts,
            importedTransactions,
          })
          .where(eq(syncRuns.id, run.id));

        if (pipelineCtx) {
          await recordSyncProgress(
            pipelineCtx.pipelineId,
            importedAccounts,
            importedTransactions,
            { status: "running" },
          );
          await pipelineAdvancePhase(pipelineCtx.pipelineId, "categorize");
        }
      });

      const householdId =
        pipelineCtx?.householdId ??
        (
          await step.run("load-connection-household", () =>
            db
              .select({ householdId: ingestionConnections.householdId })
              .from(ingestionConnections)
              .where(eq(ingestionConnections.id, connectionId))
              .limit(1),
          )
        )[0]?.householdId;

      if (householdId) {
        await sendValidatedStepEvent(
          step,
          "categorize-imported-transactions",
          EVENT_NAMES.categorizeTransactions,
          { connectionId, householdId },
        );
      }

      return result;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown bank sync error";

      await step.run("fail-sync-run", async () => {
        await db
          .update(syncRuns)
          .set({
            status: "failed",
            finishedAt: new Date(),
            errorMessage: message,
          })
          .where(eq(syncRuns.id, run.id));

        if (pipelineCtx) {
          // Store safe user-facing message; raw error is logged via Sentry below.
          await pipelineFail(
            pipelineCtx.pipelineId,
            "Bank sync encountered an error. Please try again or contact support.",
          );
        }
      });

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
