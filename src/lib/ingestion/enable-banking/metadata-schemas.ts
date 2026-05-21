import { z } from "zod";

import { configurationError } from "@/lib/errors/catalog";
import { logger } from "@/lib/logger";
import type {
  ConnectionMetadata,
  EnableBankingSyncMetadata,
  TransactionMetadata,
} from "@/lib/ingestion/enable-banking/types";

const transactionSyncParamsSchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  strategy: z.enum(["default", "longest"]),
  transactionStatus: z.literal("BOOK"),
});

const syncProgressSchema = z.object({
  importedAccounts: z.number().optional(),
  importedTransactions: z.number().optional(),
  pagesFetched: z.number().optional(),
  currentAccountId: z.string().optional(),
  currentAccountName: z.string().optional(),
  rateLimitedUntil: z.string().optional(),
});

export const enableBankingSyncMetadataSchema = z.object({
  enableBanking: z
    .object({
      transactionParams: transactionSyncParamsSchema.optional(),
      completedAccountIds: z.array(z.string()).optional(),
      accountCursors: z
        .record(
          z.string(),
          z.object({
            continuationKey: z.string(),
            paramsKey: z.string(),
          }),
        )
        .optional(),
      progress: syncProgressSchema.optional(),
    })
    .optional(),
});

export const connectionMetadataSchema = z
  .object({
    enableBanking: z
      .object({
        initialTransactionSyncCompleted: z.boolean().optional(),
        initialTransactionSyncCompletedAt: z.string().optional(),
      })
      .optional(),
    psuHeaders: z.record(z.string(), z.string()).optional(),
  })
  .passthrough();

const parsedDescriptionMetadataSchema = z.object({
  transactionType: z.string(),
  paymentChannel: z.string(),
  merchantName: z.string().nullable(),
  merchantAddress: z.string().nullable(),
  counterparty: z.string().nullable(),
  purpose: z.string().nullable(),
  metadata: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.null()]),
  ),
});

export const transactionMetadataSchema = z
  .object({
    providerDescription: z.string().optional(),
    observedMerchantName: z.string().nullable().optional(),
    providerMerchantName: z.string().nullable().optional(),
    parsed: parsedDescriptionMetadataSchema.optional(),
    userEdits: z
      .object({
        descriptionEdited: z.boolean().optional(),
        merchantNameEdited: z.boolean().optional(),
        originalDescription: z.string().optional(),
        originalMerchantName: z.string().nullable().optional(),
        updatedAt: z.string().optional(),
      })
      .optional(),
    autoLabel: z
      .object({
        appliedAt: z.string(),
        source: z.string(),
        confidence: z.number(),
        originalDescription: z.string(),
        originalMerchantName: z.string().nullable(),
        appliedDescription: z.string(),
        appliedMerchantName: z.string().nullable(),
        appliedCategoryId: z.string().nullable(),
        undone: z.boolean(),
      })
      .optional(),
  })
  .passthrough();

function logInvalidMetadata(scope: string, context: Record<string, unknown>) {
  logger.warn("sync.metadata.invalid", { scope, ...context });
}

export function parseEnableBankingSyncMetadata(
  raw: unknown,
  context: { syncRunId?: string },
): EnableBankingSyncMetadata {
  const parsed = enableBankingSyncMetadataSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    logInvalidMetadata("sync_run", {
      syncRunId: context.syncRunId,
      fieldPaths: parsed.error.issues.map((issue) => issue.path.join(".")),
    });
    return {};
  }
  return parsed.data as EnableBankingSyncMetadata;
}

export function parseConnectionMetadata(
  raw: unknown,
  context: { connectionId?: string },
): ConnectionMetadata {
  const parsed = connectionMetadataSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    logInvalidMetadata("connection", {
      connectionId: context.connectionId,
      fieldPaths: parsed.error.issues.map((issue) => issue.path.join(".")),
    });
    return {};
  }
  return parsed.data as ConnectionMetadata;
}

/** Strict parse for writes that must not proceed with corrupt connection metadata. */
export function requireConnectionMetadata(
  raw: unknown,
  context: { connectionId?: string },
): ConnectionMetadata {
  const parsed = connectionMetadataSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    logInvalidMetadata("connection", {
      connectionId: context.connectionId,
      fieldPaths: parsed.error.issues.map((issue) => issue.path.join(".")),
    });
    throw configurationError("Enable Banking connection metadata is invalid", {
      context: { connectionId: context.connectionId },
    });
  }
  return parsed.data as ConnectionMetadata;
}

export function parseTransactionMetadata(
  raw: unknown,
  context: { transactionId?: string },
): TransactionMetadata {
  const parsed = transactionMetadataSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    logInvalidMetadata("transaction", {
      transactionId: context.transactionId,
      fieldPaths: parsed.error.issues.map((issue) => issue.path.join(".")),
    });
    return {};
  }
  return parsed.data as TransactionMetadata;
}
