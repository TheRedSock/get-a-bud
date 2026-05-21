import { eq } from "drizzle-orm";

import { db } from "@/db";
import { ingestionConnections, syncRuns } from "@/db/schema";
import {
  dateDaysBefore,
  transactionParamsKey,
} from "@/lib/ingestion/enable-banking/connection-helpers";
import { SyncRunMetadataCache } from "@/lib/ingestion/enable-banking/metadata";
import { parseConnectionMetadata } from "@/lib/ingestion/enable-banking/metadata-schemas";
import type {
  SyncProgress,
  TransactionSyncParams,
} from "@/lib/ingestion/enable-banking/types";

/** Overlap window for incremental syncs to catch late-posting transactions. */
const INCREMENTAL_SYNC_LOOKBACK_DAYS = 7;

export function getRunProgress(cache: SyncRunMetadataCache): SyncProgress {
  const progress = cache.get().enableBanking?.progress;

  return {
    importedAccounts: progress?.importedAccounts ?? 0,
    importedTransactions: progress?.importedTransactions ?? 0,
    pagesFetched: progress?.pagesFetched ?? 0,
    currentAccountId: progress?.currentAccountId,
    currentAccountName: progress?.currentAccountName,
    rateLimitedUntil: progress?.rateLimitedUntil,
  };
}

export async function getOrCreateTransactionParams(
  connection: typeof ingestionConnections.$inferSelect,
  cache: SyncRunMetadataCache,
): Promise<TransactionSyncParams> {
  const existing = cache.get().enableBanking?.transactionParams;

  if (existing) {
    return existing;
  }

  const connectionMetadata = parseConnectionMetadata(connection.metadata, {
    connectionId: connection.id,
  });
  const hasCompletedInitialSync = Boolean(
    connectionMetadata.enableBanking?.initialTransactionSyncCompleted,
  );
  const params: TransactionSyncParams =
    connection.lastSyncedAt && hasCompletedInitialSync
      ? {
          strategy: "default",
          dateFrom: dateDaysBefore(connection.lastSyncedAt, INCREMENTAL_SYNC_LOOKBACK_DAYS),
          dateTo: new Date().toISOString().slice(0, 10),
          transactionStatus: "BOOK",
        }
      : {
          strategy: "longest",
          transactionStatus: "BOOK",
        };

  cache.update((data) => ({
    ...data,
    enableBanking: {
      ...(data.enableBanking ?? {}),
      transactionParams: params,
    },
  }));
  await cache.flush();

  return params;
}

export async function updateSyncRunProgress(
  cache: SyncRunMetadataCache,
  syncRunId: string | undefined,
  progress: SyncProgress,
) {
  if (!syncRunId) {
    return;
  }

  cache.update((data) => ({
    ...data,
    enableBanking: {
      ...(data.enableBanking ?? {}),
      progress,
    },
  }));

  await db
    .update(syncRuns)
    .set({
      importedAccounts: progress.importedAccounts,
      importedTransactions: progress.importedTransactions,
      metadata: cache.get() as Record<string, unknown>,
    })
    .where(eq(syncRuns.id, syncRunId));
}

export function getRunAccountCursor(
  cache: SyncRunMetadataCache,
  input: {
    providerAccountId: string;
    params: TransactionSyncParams;
  },
) {
  const cursor =
    cache.get().enableBanking?.accountCursors?.[input.providerAccountId];

  if (!cursor || cursor.paramsKey !== transactionParamsKey(input.params)) {
    return undefined;
  }

  return cursor.continuationKey;
}

export async function updateRunAccountCursor(
  cache: SyncRunMetadataCache,
  input: {
    syncRunId?: string;
    providerAccountId: string;
    params: TransactionSyncParams;
    continuationKey?: string;
  },
) {
  if (!input.syncRunId) {
    return;
  }

  cache.update((data) => {
    const accountCursors = {
      ...(data.enableBanking?.accountCursors ?? {}),
    };

    if (input.continuationKey) {
      accountCursors[input.providerAccountId] = {
        continuationKey: input.continuationKey,
        paramsKey: transactionParamsKey(input.params),
      };
    } else {
      delete accountCursors[input.providerAccountId];
    }

    return {
      ...data,
      enableBanking: {
        ...(data.enableBanking ?? {}),
        accountCursors,
      },
    };
  });
  await cache.flush();
}

export async function markRunAccountCompleted(
  cache: SyncRunMetadataCache,
  input: {
    syncRunId?: string;
    providerAccountId: string;
  },
) {
  if (!input.syncRunId) {
    return;
  }

  cache.update((data) => {
    const completedAccountIds = new Set(
      data.enableBanking?.completedAccountIds ?? [],
    );
    completedAccountIds.add(input.providerAccountId);

    return {
      ...data,
      enableBanking: {
        ...(data.enableBanking ?? {}),
        completedAccountIds: [...completedAccountIds],
      },
    };
  });
  await cache.flush();
}

export function getRunCompletedAccountIds(cache: SyncRunMetadataCache) {
  return new Set(cache.get().enableBanking?.completedAccountIds ?? []);
}
