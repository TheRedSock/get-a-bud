import { NonRetriableError } from "inngest";

import { inngest } from "@/inngest/client";
import { categorizeTransactionPage } from "@/inngest/lib/categorize-page";
import {
  loadFinancialAccountIdsForConnection,
  resolveHouseholdIdForConnection,
} from "@/inngest/lib/categorize-scope";
import {
  categorizeTransactionsSchema,
  parseJobEvent,
} from "@/inngest/lib/event-validation";
import { categorizeTransactionsEvent, EVENT_NAMES } from "@/inngest/lib/events";
import { sendValidatedStepEvent } from "@/inngest/lib/send-event";

export const categorizeTransactions = inngest.createFunction(
  {
    id: "categorize-transactions",
    name: "Categorize transactions",
    triggers: categorizeTransactionsEvent,
  },
  async ({ event, step }) => {
    const eventData = parseJobEvent(categorizeTransactionsSchema, event.data, {
      eventName: EVENT_NAMES.categorizeTransactions,
    });
    const connectionId = eventData.connectionId;
    let householdId = eventData.householdId;
    const afterId = eventData.afterId;

    if (!householdId && connectionId) {
      householdId = await step.run("resolve-connection-household", () =>
        resolveHouseholdIdForConnection(connectionId),
      );
    }

    if (!householdId) {
      throw new NonRetriableError(
        connectionId
          ? `Connection ${connectionId} was not found`
          : "Categorize event is missing householdId",
      );
    }

    let accountIds: string[] | undefined;
    if (connectionId) {
      accountIds = await step.run("resolve-connection-accounts", () =>
        loadFinancialAccountIdsForConnection(connectionId),
      );
      if (accountIds.length === 0) {
        return { updated: 0, skipped: "no_accounts_for_connection" };
      }
    }

    const pageResult = await step.run(
      `categorize-page-${afterId ?? "start"}`,
      () =>
        categorizeTransactionPage(householdId!, {
          afterId,
          accountIds,
        }),
    );

    if (pageResult.hasMore && pageResult.lastScannedId) {
      await sendValidatedStepEvent(step, "continue-categorize", EVENT_NAMES.categorizeTransactions, {
        householdId,
        afterId: pageResult.lastScannedId,
        ...(connectionId ? { connectionId } : {}),
      });
      return pageResult;
    }

    await sendValidatedStepEvent(step, "link-transfer-pairs", EVENT_NAMES.linkTransferPairs, {
      householdId,
    });

    return pageResult;
  },
);
