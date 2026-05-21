import { and, asc, eq, gt, inArray, isNotNull, isNull } from "drizzle-orm";

import { db } from "@/db";
import { transactions, transactionLinks } from "@/db/schema";
import { inngest } from "@/inngest/client";
import {
  findOneSidedTransfers,
  findTransferMatches,
  type TransferCandidate,
} from "@/lib/classification/linking";
import {
  linkTransferPairsSchema,
  parseJobEvent,
} from "@/inngest/lib/event-validation";
import { linkTransferPairsEvent, EVENT_NAMES } from "@/inngest/lib/events";
import { sendValidatedStepEvent } from "@/inngest/lib/send-event";

export const linkTransferPairs = inngest.createFunction(
  {
    id: "link-transfer-pairs",
    name: "Link transfer pairs",
    triggers: linkTransferPairsEvent,
  },
  async ({ event, step }) => {
    const { householdId, afterId } = parseJobEvent(
      linkTransferPairsSchema,
      event.data,
      { eventName: EVENT_NAMES.linkTransferPairs },
    );
    const PAGE_SIZE = 100;

    // Load unlinked transfer candidates
    const candidateRows = await step.run("load-candidates", () =>
      db
        .select({
          id: transactions.id,
          householdId: transactions.householdId,
          accountId: transactions.accountId,
          amountCents: transactions.amountCents,
          currency: transactions.currency,
          date: transactions.date,
          transactionType: transactions.transactionType,
          transferGroupId: transactions.transferGroupId,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.householdId, householdId),
            isNull(transactions.transferGroupId),
            eq(transactions.excludedFromBudget, false),
            isNotNull(transactions.transactionType),
            afterId ? gt(transactions.id, afterId) : undefined,
            inArray(transactions.transactionType, [
              "internal_transfer",
              "investment",
            ]),
          ),
        )
        .orderBy(asc(transactions.id))
        .limit(PAGE_SIZE),
    );
    const lastScannedId = candidateRows.at(-1)?.id;

    // Convert to TransferCandidate shape
    const candidates: TransferCandidate[] = candidateRows.map((r) => ({
      id: r.id,
      householdId: r.householdId,
      accountId: r.accountId,
      amountCents: r.amountCents,
      currency: r.currency,
      date: r.date,
      transactionType: r.transactionType,
      transferGroupId: r.transferGroupId,
    }));

    if (candidates.length === 0) {
      await sendValidatedStepEvent(
        step,
        "detect-recurring-bills",
        EVENT_NAMES.detectRecurringBills,
        { householdId },
      );
      return { linked: 0, oneSided: 0 };
    }

    // Run matching algorithm
    const matches = findTransferMatches(candidates);

    let linked = 0;

    if (matches.length > 0) {
      linked = await step.run("apply-transfer-links", async () => {
        // Create transaction_links rows (conflict-safe for retries)
        await db
          .insert(transactionLinks)
          .values(
            matches.flatMap((match) => [
              {
                householdId,
                groupId: match.groupId,
                transactionId: match.sourceId,
                role: "source",
                confidence: match.confidence.toFixed(2),
                confirmed: match.autoConfirm,
              },
              {
                householdId,
                groupId: match.groupId,
                transactionId: match.destinationId,
                role: "destination",
                confidence: match.confidence.toFixed(2),
                confirmed: match.autoConfirm,
              },
            ]),
          )
          .onConflictDoNothing();

        for (const match of matches) {
          // Update convenience columns on both transactions
          const updates: Partial<typeof transactions.$inferInsert> = {
            transferGroupId: match.groupId,
            updatedAt: new Date(),
          };

          // High-confidence: auto-exclude from budget
          if (match.autoConfirm) {
            updates.excludedFromBudget = true;
          }

          await db
            .update(transactions)
            .set({ ...updates, linkedTransactionId: match.destinationId })
            .where(eq(transactions.id, match.sourceId));

          await db
            .update(transactions)
            .set({ ...updates, linkedTransactionId: match.sourceId })
            .where(eq(transactions.id, match.destinationId));
        }

        return matches.length;
      });
    }

    // Handle one-sided transfers (exclude from budget even without a match)
    const matchedIds = new Set(
      matches.flatMap((m) => [m.sourceId, m.destinationId]),
    );
    const oneSidedIds = findOneSidedTransfers(
      candidates,
      matchedIds,
    );

    if (oneSidedIds.length > 0) {
      await step.run("exclude-one-sided", () =>
        db
          .update(transactions)
          .set({ excludedFromBudget: true, updatedAt: new Date() })
          .where(
            and(
              inArray(transactions.id, oneSidedIds),
              eq(transactions.excludedFromBudget, false),
            ),
          ),
      );
    }

    // If we loaded a full page, there may be more candidates. Re-enqueue.
    if (candidates.length >= PAGE_SIZE && lastScannedId) {
      await sendValidatedStepEvent(
        step,
        "continue-link-transfers",
        EVENT_NAMES.linkTransferPairs,
        { householdId, afterId: lastScannedId },
      );
    } else {
      await sendValidatedStepEvent(
        step,
        "detect-recurring-bills",
        EVENT_NAMES.detectRecurringBills,
        { householdId },
      );
    }

    return { linked, oneSided: oneSidedIds.length };
  },
);
