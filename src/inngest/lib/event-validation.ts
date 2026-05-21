import { NonRetriableError } from "inngest";
import { z } from "zod";

import { logger } from "@/lib/logger";

const idSchema = z.string().min(1);

export const bankConnectionSyncSchema = z.object({
  connectionId: idSchema,
  runId: idSchema.optional(),
});

export const categorizeTransactionsSchema = z
  .object({
    householdId: idSchema.optional(),
    connectionId: idSchema.optional(),
    afterId: idSchema.optional(),
  })
  .refine((data) => Boolean(data.householdId || data.connectionId), {
    message: "householdId or connectionId is required",
  });

export const linkTransferPairsSchema = z.object({
  householdId: idSchema,
  afterId: idSchema.optional(),
});

export const detectRecurringBillsSchema = z.object({
  householdId: idSchema,
  matchExpenseOffset: z.number().int().nonnegative().optional(),
  expenseOffset: z.number().int().nonnegative().optional(),
});

export const retrainModelSchema = z.object({
  householdId: idSchema,
});

export const backfillParsedFieldsSchema = z.object({
  householdId: idSchema,
  afterId: idSchema.optional(),
});

export const notificationBatchSchema = z.object({}).strict();

export type BankConnectionSyncEvent = z.infer<typeof bankConnectionSyncSchema>;
export type CategorizeTransactionsEvent = z.infer<
  typeof categorizeTransactionsSchema
>;
export type LinkTransferPairsEvent = z.infer<typeof linkTransferPairsSchema>;
export type DetectRecurringBillsEvent = z.infer<typeof detectRecurringBillsSchema>;
export type RetrainModelEvent = z.infer<typeof retrainModelSchema>;
export type BackfillParsedFieldsEvent = z.infer<typeof backfillParsedFieldsSchema>;
export type NotificationBatchEvent = z.infer<typeof notificationBatchSchema>;

export function parseJobEvent<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  data: unknown,
  context: { eventName: string },
): z.infer<TSchema> {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    logger.warn("inngest.event.invalid", {
      eventName: context.eventName,
      fieldPaths: parsed.error.issues.map((issue) => issue.path.join(".")),
    });
    throw new NonRetriableError(
      `Invalid event payload for ${context.eventName}`,
    );
  }
  return parsed.data;
}
