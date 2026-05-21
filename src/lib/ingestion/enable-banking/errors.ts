import { eq } from "drizzle-orm";

import { db } from "@/db";
import { ingestionConnections } from "@/db/schema";
import { EnableBankingRateLimitError } from "@/lib/ingestion/enable-banking/client";
import type { SyncRunMetadataCache } from "@/lib/ingestion/enable-banking/metadata";
import { updateSyncRunProgress } from "@/lib/ingestion/enable-banking/sync-progress";
import type { SyncProgress } from "@/lib/ingestion/enable-banking/types";
import type { IngestionSyncResult } from "@/lib/ingestion/types";

export async function handleEnableBankingRateLimit(input: {
  error: EnableBankingRateLimitError;
  connectionId: string;
  metadataCache: SyncRunMetadataCache;
  syncRunId?: string;
  progress: SyncProgress;
}): Promise<IngestionSyncResult> {
  const retryAt =
    input.error.retryAt ?? new Date(Date.now() + 6 * 60 * 60 * 1000);
  input.progress.rateLimitedUntil = retryAt.toISOString();
  await updateSyncRunProgress(
    input.metadataCache,
    input.syncRunId,
    input.progress,
  );
  await db
    .update(ingestionConnections)
    .set({
      status: "rate_limited",
      rateLimitedUntil: retryAt,
      updatedAt: new Date(),
    })
    .where(eq(ingestionConnections.id, input.connectionId));

  return {
    accounts: [],
    transactions: [],
    rateLimitedUntil: retryAt,
    progress: input.progress,
  };
}

export function isEnableBankingRateLimitError(
  error: unknown,
): error is EnableBankingRateLimitError {
  return error instanceof EnableBankingRateLimitError;
}
