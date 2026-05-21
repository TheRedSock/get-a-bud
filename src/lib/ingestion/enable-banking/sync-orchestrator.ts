import { eq } from "drizzle-orm";

import { serverEnv } from "@/config/env";
import { db } from "@/db";
import { ingestionConnections } from "@/db/schema";
import {
  EnableBankingClient,
} from "@/lib/ingestion/enable-banking/client";
import {
  getStoredPsuHeaders,
  resolvePrivateKey,
  sessionAccountId,
} from "@/lib/ingestion/enable-banking/connection-helpers";
import {
  handleEnableBankingRateLimit,
  isEnableBankingRateLimitError,
} from "@/lib/ingestion/enable-banking/errors";
import {
  type SessionAccountRecord,
  upsertEnableBankingAccount,
} from "@/lib/ingestion/enable-banking/accounts";
import { SyncRunMetadataCache } from "@/lib/ingestion/enable-banking/metadata";
import { requireConnectionMetadata } from "@/lib/ingestion/enable-banking/metadata-schemas";
import { reconcileAccountBalance } from "@/lib/ingestion/enable-banking/reconciliation";
import {
  getOrCreateTransactionParams,
  getRunAccountCursor,
  getRunCompletedAccountIds,
  getRunProgress,
  markRunAccountCompleted,
  updateSyncRunProgress,
} from "@/lib/ingestion/enable-banking/sync-progress";
import {
  mapImportedTransactionsForResult,
  syncEnableBankingTransactionPage,
} from "@/lib/ingestion/enable-banking/transactions";
import {
  DEFAULT_SYNC_PAGE_BUDGET,
  DEFAULT_SYNC_TIME_BUDGET_MS,
} from "@/lib/ingestion/enable-banking/types";
import type { IngestionSyncResult } from "@/lib/ingestion/types";
import { configurationError, notFoundError } from "@/lib/errors/catalog";

export async function syncEnableBankingConnection(
  connectionId: string,
  options: {
    syncRunId?: string;
    maxPages?: number;
    maxDurationMs?: number;
  } = {},
): Promise<IngestionSyncResult> {
  const invocationStartedAt = Date.now();
  const maxPages = options.maxPages ?? DEFAULT_SYNC_PAGE_BUDGET;
  const maxDurationMs = options.maxDurationMs ?? DEFAULT_SYNC_TIME_BUDGET_MS;
  let pagesFetchedThisInvocation = 0;

  const [connection] = await db
    .select()
    .from(ingestionConnections)
    .where(eq(ingestionConnections.id, connectionId))
    .limit(1);

  if (!connection) {
    throw notFoundError("Enable Banking connection not found", {
      connectionId,
    });
  }

  if (!connection.consentSessionId) {
    throw configurationError(
      "Enable Banking connection is missing a consent session id",
      { context: { connectionId } },
    );
  }

  if (!connection.externalApplicationId) {
    throw configurationError(
      "Enable Banking connection is missing an application id",
      { context: { connectionId } },
    );
  }

  const client = new EnableBankingClient({
    applicationId: connection.externalApplicationId,
    pemPrivateKey: await resolvePrivateKey(connection),
    baseUrl: serverEnv.ENABLE_BANKING_BASE_URL,
  });
  const psuHeaders = getStoredPsuHeaders(connection.metadata);
  const metadataCache = await SyncRunMetadataCache.load(options.syncRunId);
  const transactionParams = await getOrCreateTransactionParams(
    connection,
    metadataCache,
  );
  const progress = getRunProgress(metadataCache);
  const completedAccountIds = getRunCompletedAccountIds(metadataCache);

  const shouldPauseInvocation = () =>
    pagesFetchedThisInvocation >= maxPages ||
    Date.now() - invocationStartedAt >= maxDurationMs;

  const buildPartialResult = (
    accounts: IngestionSyncResult["accounts"],
    importedTransactions: ReturnType<typeof mapImportedTransactionsForResult>,
  ): IngestionSyncResult => ({
    accounts,
    transactions: importedTransactions,
    continuationRequired: true,
    progress,
  });

  try {
    const session = await client.getSession(connection.consentSessionId, psuHeaders);
    const sessionAccounts = session.accounts_data?.length
      ? session.accounts_data
      : session.accounts ?? [];
    const accounts: IngestionSyncResult["accounts"] = [];
    const importedTransactionRows: Parameters<
      typeof mapImportedTransactionsForResult
    >[0] = [];

    for (const sessionAccount of sessionAccounts) {
      const accountId = sessionAccountId(sessionAccount);
      const sessionAccountRecord = (
        typeof sessionAccount === "string" ? { uid: sessionAccount } : sessionAccount
      ) as SessionAccountRecord;

      if (!accountId || completedAccountIds.has(accountId)) {
        continue;
      }

      const { account, financialAccountId, reportedBalance } =
        await upsertEnableBankingAccount({
          connectionId,
          householdId: connection.householdId,
          institutionName: session.aspsp?.name,
          client,
          accountId,
          sessionAccountRecord,
          psuHeaders,
        });

      accounts.push(account);
      progress.currentAccountId = account.providerAccountId;
      progress.currentAccountName = account.name;
      await updateSyncRunProgress(metadataCache, options.syncRunId, progress);

      let continuationKey = getRunAccountCursor(metadataCache, {
        providerAccountId: account.providerAccountId,
        params: transactionParams,
      });
      let hasMorePages = true;

      while (hasMorePages) {
        const pageResult = await syncEnableBankingTransactionPage({
          client,
          account,
          financialAccountId,
          householdId: connection.householdId,
          transactionParams,
          continuationKey,
          psuHeaders,
          metadataCache,
          syncRunId: options.syncRunId,
          progress,
          aspspCountry: session.aspsp?.country ?? undefined,
        });

        pagesFetchedThisInvocation += 1;
        importedTransactionRows.push(...pageResult.imported);
        continuationKey = pageResult.continuationKey;
        hasMorePages = pageResult.hasMorePages;

        if (hasMorePages && shouldPauseInvocation()) {
          return buildPartialResult(
            accounts,
            mapImportedTransactionsForResult(importedTransactionRows),
          );
        }
      }

      progress.importedAccounts += 1;
      await reconcileAccountBalance({
        householdId: connection.householdId,
        financialAccountId,
        providerAccountId: account.providerAccountId,
        currency: account.currency,
        reportedBalance,
      });
      completedAccountIds.add(account.providerAccountId);
      await markRunAccountCompleted(metadataCache, {
        syncRunId: options.syncRunId,
        providerAccountId: account.providerAccountId,
      });
      await updateSyncRunProgress(metadataCache, options.syncRunId, progress);

      if (shouldPauseInvocation()) {
        return buildPartialResult(
          accounts,
          mapImportedTransactionsForResult(importedTransactionRows),
        );
      }
    }

    const connectionMetadata = requireConnectionMetadata(connection.metadata, {
      connectionId,
    });

    await db
      .update(ingestionConnections)
      .set({
        lastSyncedAt: new Date(),
        status: "connected",
        rateLimitedUntil: null,
        metadata: {
          ...connectionMetadata,
          enableBanking: {
            ...(connectionMetadata.enableBanking ?? {}),
            initialTransactionSyncCompleted: true,
            initialTransactionSyncCompletedAt: new Date().toISOString(),
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(ingestionConnections.id, connectionId));

    return {
      accounts,
      transactions: mapImportedTransactionsForResult(importedTransactionRows),
      progress,
    };
  } catch (error) {
    if (isEnableBankingRateLimitError(error)) {
      return handleEnableBankingRateLimit({
        error,
        connectionId,
        metadataCache,
        syncRunId: options.syncRunId,
        progress,
      });
    }

    throw error;
  }
}
