import { backfillParsedFields } from "@/inngest/functions/backfill-parsed-fields";
import { categorizeTransactions } from "@/inngest/functions/categorize-transactions";
import { detectRecurringBills } from "@/inngest/functions/detect-recurring-bills";
import { linkTransferPairs } from "@/inngest/functions/link-transfer-pairs";
import { notificationBatch } from "@/inngest/functions/notification-batch";
import { retrainClassificationModel } from "@/inngest/functions/retrain-classification-model";
import { scheduledBankSync } from "@/inngest/functions/scheduled-bank-sync";
import { pipelineMaintenance } from "@/inngest/functions/pipeline-maintenance";
import { syncBankConnection } from "@/inngest/functions/sync-bank-connection";

export const functions = [
  syncBankConnection,
  scheduledBankSync,
  categorizeTransactions,
  linkTransferPairs,
  detectRecurringBills,
  retrainClassificationModel,
  backfillParsedFields,
  notificationBatch,
  pipelineMaintenance,
];
