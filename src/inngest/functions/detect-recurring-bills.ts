import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";

import { db } from "@/db";
import { recurringBills } from "@/db/schema";
import { cadenceToExpectedDays } from "@/lib/classification/recurring";
import type { BillCadence } from "@/lib/classification/recurring";
import {
  clearUnapprovedBillsForReplay,
  daysOverdueVsDueDate,
  shouldClearUnapprovedForReplayStart,
} from "@/lib/finance/bills";
import { inngest } from "@/inngest/client";
import {
  detectRecurringBillsSchema,
  parseJobEvent,
} from "@/inngest/lib/event-validation";
import { detectRecurringBillsEvent, EVENT_NAMES } from "@/inngest/lib/events";
import {
  completeHouseholdPipelineChains,
  pipelineHeartbeat,
  recordRecurringProgress,
  resolvePipelineForPostSyncJob,
  resolveRecurringReplayPipeline,
} from "@/inngest/lib/pipeline-progress";
import { sendValidatedStepEvent } from "@/inngest/lib/send-event";
import {
  cleanupStaleRecurringBills,
  detectNewRecurringBills,
  loadClaimedTransactionIds,
  matchExistingRecurringBills,
  MAX_DETECT_EXPENSE_PAGES_PER_RUN,
  MAX_MATCH_EXPENSE_PAGES_PER_RUN,
} from "@/inngest/lib/recurring-detection";

export const detectRecurringBills = inngest.createFunction(
  {
    id: "detect-recurring-bills",
    name: "Detect recurring bills",
    triggers: detectRecurringBillsEvent,
  },
  async ({ event, step }) => {
    const {
      householdId,
      matchExpenseOffset,
      expenseOffset = 0,
      replayUnapproved,
    } = parseJobEvent(detectRecurringBillsSchema, event.data, {
      eventName: EVENT_NAMES.detectRecurringBills,
    });

    const pipelineRun = await step.run("resolve-pipeline-run", async () => {
      if (replayUnapproved) {
        return resolveRecurringReplayPipeline(householdId);
      }
      return resolvePipelineForPostSyncJob({ householdId });
    });

    // Heartbeat only — phase advance is done by link-transfer-pairs before
    // emitting the recurring event. For recurring_replay (standalone), the
    // run is created with initialPhase="recurring" so no advance needed.
    if (pipelineRun && !matchExpenseOffset && expenseOffset === 0) {
      await step.run("pipeline-heartbeat-recurring", () =>
        pipelineHeartbeat(pipelineRun.id, { currentPhase: "recurring" }),
      );
    }

    const runStartTime = new Date();
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - 24);
    const cutoffStr = cutoffDate.toISOString().slice(0, 10);

    const isPhaseBContinuation = expenseOffset > 0;
    const isReplayStart = shouldClearUnapprovedForReplayStart({
      replayUnapproved,
      matchExpenseOffset,
      expenseOffset,
    });

    let removedUnapproved = 0;

    if (isReplayStart) {
      const replayResult = await step.run("clear-unapproved-for-replay", () =>
        clearUnapprovedBillsForReplay(householdId),
      );
      removedUnapproved = replayResult.removed;
    }

    let phaseA: {
      existingMatched: number;
      claimedIds: string[];
    };

    if (!isPhaseBContinuation) {
      const matchResult = await step.run("match-existing-bills", () =>
        matchExistingRecurringBills({
          householdId,
          cutoffStr,
          runStartTime,
          startOffset: matchExpenseOffset ?? 0,
          maxPages: MAX_MATCH_EXPENSE_PAGES_PER_RUN,
        }),
      );

      if (pipelineRun) {
        await step.run("pipeline-recurring-match-progress", () =>
          recordRecurringProgress(pipelineRun.id, {
            billsUpdated: matchResult.existingMatched,
          }),
        );
      }

      if (matchResult.needsContinuation && matchResult.nextMatchOffset != null) {
        await sendValidatedStepEvent(
          step,
          "continue-match-recurring",
          EVENT_NAMES.detectRecurringBills,
          {
            householdId,
            matchExpenseOffset: matchResult.nextMatchOffset,
          },
        );

        return {
          existingMatched: matchResult.existingMatched,
          continued: true,
          phase: "match" as const,
          nextMatchOffset: matchResult.nextMatchOffset,
          removedUnapproved,
        };
      }

      phaseA = {
        existingMatched: matchResult.existingMatched,
        claimedIds: matchResult.claimedIds,
      };
    } else {
      phaseA = {
        existingMatched: 0,
        claimedIds: await step.run("load-claimed-ids", () =>
          loadClaimedTransactionIds(householdId),
        ),
      };
    }

    const phaseB = await step.run("detect-new-patterns", () =>
      detectNewRecurringBills({
        householdId,
        cutoffStr,
        runStartTime,
        claimedIds: phaseA.claimedIds,
        startOffset: expenseOffset,
        maxPages: MAX_DETECT_EXPENSE_PAGES_PER_RUN,
      }),
    );

    if (pipelineRun) {
      await step.run("pipeline-recurring-detect-progress", () =>
        recordRecurringProgress(pipelineRun.id, {
          billsCreated: phaseB.detected,
          billsUpdated: phaseA.existingMatched,
        }),
      );
    }

    if (phaseB.needsContinuation && phaseB.nextOffset != null) {
      await sendValidatedStepEvent(
        step,
        "continue-detect-recurring",
        EVENT_NAMES.detectRecurringBills,
        { householdId, expenseOffset: phaseB.nextOffset },
      );

      return {
        detected: phaseB.detected,
        existingMatched: phaseA.existingMatched,
        duplicates: phaseB.duplicates,
        priceChanges: phaseB.priceChanges,
        historyInserted: phaseB.historyInserted,
        continued: true,
        phase: "detect" as const,
        nextOffset: phaseB.nextOffset,
        removedUnapproved,
      };
    }

    const staleBillCleanup = await step.run("cleanup-stale-bill-history", () =>
      cleanupStaleRecurringBills(householdId),
    );

    let possiblyCancelled = 0;
    let ended = 0;

    // Manual replay rescans from scratch; auto-ending here would mark bills
    // inactive before the user can review newly detected patterns. Lifecycle
    // runs after bank sync only.
    if (!replayUnapproved) {
      const billsForLifecycle = await step.run("load-bills-for-lifecycle", () =>
        db
          .select({
            id: recurringBills.id,
            nextDueDate: recurringBills.nextDueDate,
            cadence: recurringBills.cadence,
            isActive: recurringBills.isActive,
          })
          .from(recurringBills)
          .where(
            and(
              eq(recurringBills.householdId, householdId),
              eq(recurringBills.isActive, true),
              isNotNull(recurringBills.nextDueDate),
              isNull(recurringBills.userEndedAt),
            ),
          ),
      );

      const possiblyCancelledIds: string[] = [];
      const endedIds: string[] = [];

      for (const bill of billsForLifecycle) {
        if (!bill.nextDueDate) continue;

        const expectedDays = cadenceToExpectedDays(bill.cadence as BillCadence);
        const daysOverdue = daysOverdueVsDueDate({
          nextDueDate: bill.nextDueDate,
          asOf: runStartTime,
        });

        if (daysOverdue > expectedDays * 2) {
          endedIds.push(bill.id);
        } else if (daysOverdue > expectedDays * 1.5 && bill.isActive) {
          possiblyCancelledIds.push(bill.id);
        }
      }

      if (possiblyCancelledIds.length > 0) {
        await step.run("flag-cancellations", () =>
          db
            .update(recurringBills)
            .set({ isPossiblyCancelled: true, updatedAt: new Date() })
            .where(inArray(recurringBills.id, possiblyCancelledIds)),
        );
      }

      if (endedIds.length > 0) {
        await step.run("mark-ended-bills", () =>
          db
            .update(recurringBills)
            .set({
              isActive: false,
              isPossiblyCancelled: false,
              updatedAt: new Date(),
            })
            .where(inArray(recurringBills.id, endedIds)),
        );
      }

      possiblyCancelled = possiblyCancelledIds.length;
      ended = endedIds.length;

      if (pipelineRun) {
        await step.run("pipeline-recurring-flag-progress", () =>
          recordRecurringProgress(pipelineRun.id, {
            billsFlagged: possiblyCancelled + ended,
          }),
        );
      }
    }

    await step.run("complete-pipeline-runs", () =>
      completeHouseholdPipelineChains(householdId, {
        kinds: replayUnapproved ? ["recurring_replay"] : ["full_post_sync"],
      }),
    );

    return {
      detected: phaseB.detected,
      existingMatched: phaseA.existingMatched,
      duplicates: phaseB.duplicates,
      priceChanges: phaseB.priceChanges,
      historyInserted: phaseB.historyInserted,
      staleDeleted: staleBillCleanup.deleted,
      staleMarkedForReview: staleBillCleanup.markedForReview,
      possiblyCancelled,
      ended,
      removedUnapproved,
    };
  },
);
