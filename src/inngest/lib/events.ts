import { eventType } from "inngest";

import {
  backfillParsedFieldsSchema,
  bankConnectionSyncSchema,
  categorizeTransactionsSchema,
  detectRecurringBillsSchema,
  linkTransferPairsSchema,
  notificationBatchSchema,
  pipelineMaintenanceSchema,
  retrainModelSchema,
  scheduledBankSyncSchema,
} from "@/inngest/lib/event-validation";

export const EVENT_NAMES = {
  bankConnectionSync: "bank.connection.sync",
  categorizeTransactions: "transactions.categorize",
  linkTransferPairs: "transactions.link-transfers",
  detectRecurringBills: "transactions.recurring.detect",
  notificationBatch: "notifications.batch",
  backfillParsedFields: "transactions.backfill-parsed-fields",
  retrainModel: "model.retrain",
  scheduledBankSync: "jobs.scheduled-bank-sync",
  pipelineMaintenance: "jobs.pipeline-maintenance",
} as const;

export const bankConnectionSyncEvent = eventType(
  EVENT_NAMES.bankConnectionSync,
  { schema: bankConnectionSyncSchema },
);
export const categorizeTransactionsEvent = eventType(
  EVENT_NAMES.categorizeTransactions,
  { schema: categorizeTransactionsSchema },
);
export const linkTransferPairsEvent = eventType(
  EVENT_NAMES.linkTransferPairs,
  { schema: linkTransferPairsSchema },
);
export const detectRecurringBillsEvent = eventType(
  EVENT_NAMES.detectRecurringBills,
  { schema: detectRecurringBillsSchema },
);
export const notificationBatchEvent = eventType(
  EVENT_NAMES.notificationBatch,
  { schema: notificationBatchSchema },
);
export const backfillParsedFieldsEvent = eventType(
  EVENT_NAMES.backfillParsedFields,
  { schema: backfillParsedFieldsSchema },
);
export const retrainModelEvent = eventType(
  EVENT_NAMES.retrainModel,
  { schema: retrainModelSchema },
);
export const scheduledBankSyncEvent = eventType(
  EVENT_NAMES.scheduledBankSync,
  { schema: scheduledBankSyncSchema },
);
export const pipelineMaintenanceEvent = eventType(
  EVENT_NAMES.pipelineMaintenance,
  { schema: pipelineMaintenanceSchema },
);
