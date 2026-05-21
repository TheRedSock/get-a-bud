import { eq } from "drizzle-orm";

import { db } from "@/db";
import { syncRuns } from "@/db/schema";
import type { ParserResult } from "@/lib/classification/parser/types";
import {
  parseEnableBankingSyncMetadata,
  parseTransactionMetadata,
} from "@/lib/ingestion/enable-banking/metadata-schemas";
import type {
  EnableBankingSyncMetadata,
  TransactionMetadata,
} from "@/lib/ingestion/enable-banking/types";

async function getRunMetadata(syncRunId: string) {
  const [run] = await db
    .select({ metadata: syncRuns.metadata })
    .from(syncRuns)
    .where(eq(syncRuns.id, syncRunId))
    .limit(1);

  return parseEnableBankingSyncMetadata(run?.metadata, { syncRunId });
}

/**
 * Mutable metadata container loaded once per invocation and written at
 * checkpoints, reducing per-helper DB reads to a single load per invocation.
 */
export class SyncRunMetadataCache {
  private data: EnableBankingSyncMetadata;

  constructor(
    private readonly syncRunId: string | undefined,
    initial: EnableBankingSyncMetadata,
  ) {
    this.data = initial;
  }

  get(): EnableBankingSyncMetadata {
    return this.data;
  }

  update(
    updater: (data: EnableBankingSyncMetadata) => EnableBankingSyncMetadata,
  ) {
    this.data = updater(this.data);
  }

  /** Flush the current metadata to the database. */
  async flush() {
    if (!this.syncRunId) return;
    await db
      .update(syncRuns)
      .set({ metadata: this.data as Record<string, unknown> })
      .where(eq(syncRuns.id, this.syncRunId));
  }

  static async load(syncRunId?: string): Promise<SyncRunMetadataCache> {
    if (!syncRunId) {
      return new SyncRunMetadataCache(undefined, {});
    }
    const data = await getRunMetadata(syncRunId);
    return new SyncRunMetadataCache(syncRunId, data);
  }
}

export function transactionMetadataWithProviderPayload(
  raw: Record<string, unknown> | undefined,
  providerDescription: string,
  observedMerchantName: string | null | undefined,
  providerMerchantName: string | null | undefined,
  existingMetadata?: Record<string, unknown> | null,
  parsed?: ParserResult,
): TransactionMetadata {
  const metadata = parseTransactionMetadata(existingMetadata, {});

  return {
    ...(raw ?? {}),
    userEdits: metadata.userEdits,
    autoLabel: metadata.autoLabel,
    providerDescription,
    observedMerchantName: observedMerchantName ?? parsed?.merchantName ?? null,
    providerMerchantName: providerMerchantName ?? null,
    ...(parsed
      ? {
          parsed: {
            transactionType: parsed.transactionType,
            paymentChannel: parsed.paymentChannel,
            merchantName: parsed.merchantName,
            merchantAddress: parsed.merchantAddress,
            counterparty: parsed.counterparty,
            purpose: parsed.purpose,
            metadata: parsed.metadata,
          },
        }
      : {}),
  };
}
