import type { z } from "zod";

import { inngest } from "@/inngest/client";
import {
  backfillParsedFieldsSchema,
  bankConnectionSyncSchema,
  categorizeTransactionsSchema,
  detectRecurringBillsSchema,
  linkTransferPairsSchema,
  notificationBatchSchema,
  retrainModelSchema,
} from "@/inngest/lib/event-validation";
import { EVENT_NAMES } from "@/inngest/lib/events";

export const EVENT_SCHEMAS = {
  [EVENT_NAMES.bankConnectionSync]: bankConnectionSyncSchema,
  [EVENT_NAMES.categorizeTransactions]: categorizeTransactionsSchema,
  [EVENT_NAMES.linkTransferPairs]: linkTransferPairsSchema,
  [EVENT_NAMES.detectRecurringBills]: detectRecurringBillsSchema,
  [EVENT_NAMES.notificationBatch]: notificationBatchSchema,
  [EVENT_NAMES.backfillParsedFields]: backfillParsedFieldsSchema,
  [EVENT_NAMES.retrainModel]: retrainModelSchema,
} as const;

export type InngestEventName = keyof typeof EVENT_SCHEMAS;

export type InngestEventData<Name extends InngestEventName> = z.infer<
  (typeof EVENT_SCHEMAS)[Name]
>;

/**
 * Validates and enqueue Inngest events from app code.
 */
export async function sendInngestEvent<Name extends InngestEventName>(
  name: Name,
  data: InngestEventData<Name>,
) {
  const parsed = EVENT_SCHEMAS[name].parse(data);
  return inngest.send({ name, data: parsed });
}

type StepWithSendEvent = {
  sendEvent: (
    stepId: string,
    payload: { name: InngestEventName; data: InngestEventData<InngestEventName> },
  ) => Promise<unknown>;
};

/** Validates continuation payloads before enqueueing from within a job step. */
export async function sendValidatedStepEvent<Name extends InngestEventName>(
  step: StepWithSendEvent,
  stepId: string,
  name: Name,
  data: InngestEventData<Name>,
) {
  const parsed = EVENT_SCHEMAS[name].parse(data);
  return step.sendEvent(stepId, { name, data: parsed });
}
