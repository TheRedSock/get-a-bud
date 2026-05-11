import { eq, isNull } from "drizzle-orm";
import { cron, eventType } from "inngest";

import { db } from "@/db";
import {
  ingestionConnections,
  syncRuns,
  transactions,
  recurringBills,
} from "@/db/schema";
import { detectCategory } from "@/lib/finance/categorization";
import { syncEnableBankingConnection } from "@/lib/ingestion/enable-banking/sync";
import { inngest } from "@/inngest/client";

const bankConnectionSyncEvent = eventType("bank.connection.sync");
const categorizeTransactionsEvent = eventType("transactions.categorize");
const detectRecurringBillsEvent = eventType("transactions.recurring.detect");
const notificationBatchEvent = eventType("notifications.batch");

export const syncBankConnection = inngest.createFunction(
  {
    id: "sync-bank-connection",
    name: "Sync bank connection",
    triggers: bankConnectionSyncEvent,
  },
  async ({ event, step }) => {
    const connectionId = event.data.connectionId as string;

    const [run] = await step.run("create-sync-run", () =>
      db
        .insert(syncRuns)
        .values({
          connectionId,
          provider: "enable_banking",
          status: "running",
        })
        .returning(),
    );

    const result = await step.run("sync-enable-banking", () =>
      syncEnableBankingConnection(connectionId),
    );

    await step.run("finish-sync-run", () =>
      db
        .update(syncRuns)
        .set({
          status: result.rateLimitedUntil ? "rate_limited" : "succeeded",
          finishedAt: new Date(),
          importedAccounts: result.accounts.length,
          importedTransactions: result.transactions.length,
        })
        .where(eq(syncRuns.id, run.id)),
    );

    await step.sendEvent("categorize-imported-transactions", {
      name: "transactions.categorize",
      data: { connectionId },
    });

    return result;
  },
);

export const scheduledBankSync = inngest.createFunction(
  {
    id: "scheduled-bank-sync",
    name: "Scheduled bank sync",
    triggers: cron("0 */6 * * *"),
  },
  async ({ step }) => {
    const connections = await step.run("load-active-connections", () =>
      db
        .select({ id: ingestionConnections.id })
        .from(ingestionConnections)
        .where(eq(ingestionConnections.provider, "enable_banking")),
    );

    await Promise.all(
      connections.map((connection) =>
        step.sendEvent(`sync-${connection.id}`, {
          name: "bank.connection.sync",
          data: { connectionId: connection.id },
        }),
      ),
    );

    return { queued: connections.length };
  },
);

export const categorizeTransactions = inngest.createFunction(
  {
    id: "categorize-transactions",
    name: "Categorize transactions",
    triggers: categorizeTransactionsEvent,
  },
  async ({ event, step }) => {
    const rows = await step.run("load-uncategorized", () =>
      db
        .select()
        .from(transactions)
        .where(isNull(transactions.categoryId))
        .limit(200),
    );

    let updated = 0;

    for (const transaction of rows.filter((row) => !row.categoryId)) {
      const categoryId = await step.run(`detect-${transaction.id}`, () =>
        detectCategory(
          transaction.householdId,
          transaction.description,
          transaction.merchantName,
        ),
      );

      if (categoryId) {
        await step.run(`update-${transaction.id}`, () =>
          db
            .update(transactions)
            .set({ categoryId, updatedAt: new Date() })
            .where(eq(transactions.id, transaction.id)),
        );
        updated += 1;
      }
    }

    return { updated };
  },
);

export const detectRecurringBills = inngest.createFunction(
  {
    id: "detect-recurring-bills",
    name: "Detect recurring bills",
    triggers: detectRecurringBillsEvent,
  },
  async ({ event, step }) => {
    const householdId = event.data.householdId as string;
    const rows = await step.run("load-transactions", () =>
      db
        .select()
        .from(transactions)
        .where(eq(transactions.householdId, householdId))
        .limit(500),
    );

    const merchantCounts = new Map<string, { count: number; amount: string }>();

    for (const transaction of rows) {
      const merchant = transaction.normalizedMerchantName;
      if (!merchant || Number(transaction.amount) >= 0) continue;

      const existing = merchantCounts.get(merchant) ?? {
        count: 0,
        amount: transaction.amount,
      };
      merchantCounts.set(merchant, { ...existing, count: existing.count + 1 });
    }

    const detected = [...merchantCounts.entries()].filter(([, value]) => value.count >= 2);

    for (const [merchant, value] of detected) {
      await step.run(`upsert-bill-${merchant}`, () =>
        db.insert(recurringBills).values({
          householdId,
          name: merchant,
          merchantPattern: merchant,
          cadence: "monthly",
          expectedAmount: Math.abs(Number(value.amount)).toFixed(2),
        }),
      );
    }

    return { detected: detected.length };
  },
);

export const notificationBatch = inngest.createFunction(
  {
    id: "notification-batch",
    name: "Notification batch",
    triggers: notificationBatchEvent,
  },
  async () => ({ queued: 0, note: "Notification delivery is deferred." }),
);

export const functions = [
  syncBankConnection,
  scheduledBankSync,
  categorizeTransactions,
  detectRecurringBills,
  notificationBatch,
];
