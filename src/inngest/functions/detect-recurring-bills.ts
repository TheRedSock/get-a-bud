import { and, eq, inArray, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import { recurringBills } from "@/db/schema";
import { cadenceToExpectedDays } from "@/lib/classification/recurring";
import type { BillCadence } from "@/lib/classification/recurring";
import { inngest } from "@/inngest/client";
import {
  detectRecurringBillsSchema,
  parseJobEvent,
} from "@/inngest/lib/event-validation";
import { detectRecurringBillsEvent, EVENT_NAMES } from "@/inngest/lib/events";
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
    } = parseJobEvent(detectRecurringBillsSchema, event.data, {
      eventName: EVENT_NAMES.detectRecurringBills,
    });

    const runStartTime = new Date();
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - 24);
    const cutoffStr = cutoffDate.toISOString().slice(0, 10);

    const isPhaseBContinuation = expenseOffset > 0;

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
      };
    }

    const staleBillCleanup = await step.run("cleanup-stale-bill-history", () =>
      cleanupStaleRecurringBills(householdId),
    );

    const activeBillsForCancellation = await step.run(
      "load-active-for-cancellation",
      () =>
        db
          .select({
            id: recurringBills.id,
            nextDueDate: recurringBills.nextDueDate,
            cadence: recurringBills.cadence,
          })
          .from(recurringBills)
          .where(
            and(
              eq(recurringBills.householdId, householdId),
              eq(recurringBills.isActive, true),
              eq(recurringBills.isPossiblyCancelled, false),
              isNotNull(recurringBills.nextDueDate),
            ),
          ),
    );

    const possiblyCancelledIds: string[] = [];
    const now = runStartTime.getTime();

    for (const bill of activeBillsForCancellation) {
      if (!bill.nextDueDate) continue;

      const expectedDays = cadenceToExpectedDays(bill.cadence as BillCadence);
      const thresholdDays = expectedDays * 1.5;
      const dueMs = new Date(bill.nextDueDate + "T12:00:00Z").getTime();
      const daysSinceDue = (now - dueMs) / (1000 * 60 * 60 * 24);

      if (daysSinceDue > thresholdDays) {
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

    return {
      detected: phaseB.detected,
      existingMatched: phaseA.existingMatched,
      duplicates: phaseB.duplicates,
      priceChanges: phaseB.priceChanges,
      historyInserted: phaseB.historyInserted,
      staleDeleted: staleBillCleanup.deleted,
      staleMarkedForReview: staleBillCleanup.markedForReview,
      possiblyCancelled: possiblyCancelledIds.length,
    };
  },
);
