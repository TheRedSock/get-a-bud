import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  financialAccounts,
  ingestionConnections,
  providerAccounts,
  syncRuns,
  transactions,
} from "@/db/schema";
import { normalizeMerchant } from "@/lib/finance/categorization";
import {
  EnableBankingClient,
  EnableBankingRateLimitError,
  mapEnableBankingAccount,
  mapEnableBankingTransaction,
} from "@/lib/ingestion/enable-banking/client";
import type { PsuHeaders } from "@/lib/ingestion/enable-banking/psu-headers";
import type { IngestionSyncResult } from "@/lib/ingestion/types";
import { configurationError, notFoundError } from "@/lib/errors/catalog";
import { logger } from "@/lib/logger";
import { decryptSecret } from "@/lib/security/encryption";

type TransactionSyncParams = {
  dateFrom?: string;
  dateTo?: string;
  strategy: "default" | "longest";
  transactionStatus: "BOOK";
};

type SyncProgress = {
  importedAccounts: number;
  importedTransactions: number;
  pagesFetched: number;
  currentAccountId?: string;
  currentAccountName?: string;
  rateLimitedUntil?: string;
};

type EnableBankingSyncMetadata = {
  enableBanking?: {
    transactionParams?: TransactionSyncParams;
    completedAccountIds?: string[];
    accountCursors?: Record<
      string,
      {
        continuationKey: string;
        paramsKey: string;
      }
    >;
    progress?: SyncProgress;
  };
};

const DEFAULT_SYNC_PAGE_BUDGET = 10;
const DEFAULT_SYNC_TIME_BUDGET_MS = 3 * 60 * 1000;

type ConnectionMetadata = Record<string, unknown> & {
  enableBanking?: {
    initialTransactionSyncCompleted?: boolean;
    initialTransactionSyncCompletedAt?: string;
  };
};

type TransactionMetadata = Record<string, unknown> & {
  providerDescription?: string;
  userEdits?: {
    descriptionEdited?: boolean;
    merchantNameEdited?: boolean;
    originalDescription?: string;
    originalMerchantName?: string | null;
    updatedAt?: string;
  };
};

function dateDaysBefore(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() - days);
  return result.toISOString().slice(0, 10);
}

function toCents(amount: string | number | null | undefined) {
  const parsed = Number(amount ?? 0);

  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function fromCents(cents: number) {
  return (cents / 100).toFixed(2);
}

function transactionParamsKey(params: TransactionSyncParams) {
  return JSON.stringify({
    dateFrom: params.dateFrom ?? null,
    dateTo: params.dateTo ?? null,
    strategy: params.strategy,
    transactionStatus: params.transactionStatus,
  });
}

async function resolvePrivateKey(connection: typeof ingestionConnections.$inferSelect) {
  if (
    connection.encryptedPrivateKey &&
    connection.encryptedPrivateKeyIv &&
    connection.encryptedPrivateKeyTag
  ) {
    return decryptSecret({
      ciphertext: connection.encryptedPrivateKey,
      iv: connection.encryptedPrivateKeyIv,
      tag: connection.encryptedPrivateKeyTag,
    });
  }

  throw configurationError(
    "Enable Banking private key is not configured for this connection",
    { context: { connectionId: connection.id } },
  );
}

function getStoredPsuHeaders(
  metadata: Record<string, unknown> | null | undefined,
): PsuHeaders | undefined {
  const psuHeaders = metadata?.psuHeaders;

  if (!psuHeaders || typeof psuHeaders !== "object") {
    return undefined;
  }

  return psuHeaders as PsuHeaders;
}

function firstBalanceAmount(
  response: Awaited<ReturnType<EnableBankingClient["getAccountBalances"]>>,
) {
  const balance = response.balances?.[0];

  return balance?.balance_amount?.amount ?? balance?.amount?.amount;
}

function sessionAccountId(
  account: string | { uid?: string; id?: string; account_id?: string | unknown },
) {
  if (typeof account === "string") {
    return account;
  }

  return (
    account.uid ??
    account.id ??
    (typeof account.account_id === "string" ? account.account_id : undefined)
  );
}

async function getRunMetadata(syncRunId: string) {
  const [run] = await db
    .select({ metadata: syncRuns.metadata })
    .from(syncRuns)
    .where(eq(syncRuns.id, syncRunId))
    .limit(1);

  return (run?.metadata ?? {}) as EnableBankingSyncMetadata;
}

/**
 * Mutable metadata container loaded once per invocation and written at
 * checkpoints, reducing per-helper DB reads from 5-15+ to 1 (P1-8).
 */
class SyncRunMetadataCache {
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

  update(updater: (data: EnableBankingSyncMetadata) => EnableBankingSyncMetadata) {
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

function getRunProgress(cache: SyncRunMetadataCache): SyncProgress {
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

async function getOrCreateTransactionParams(
  connection: typeof ingestionConnections.$inferSelect,
  cache: SyncRunMetadataCache,
): Promise<TransactionSyncParams> {
  const existing = cache.get().enableBanking?.transactionParams;

  if (existing) {
    return existing;
  }

  const connectionMetadata = (connection.metadata ?? {}) as ConnectionMetadata;
  const hasCompletedInitialSync = Boolean(
    connectionMetadata.enableBanking?.initialTransactionSyncCompleted,
  );
  const params: TransactionSyncParams = connection.lastSyncedAt && hasCompletedInitialSync
    ? {
        strategy: "default",
        dateFrom: dateDaysBefore(connection.lastSyncedAt, 7),
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

function transactionMetadataWithProviderPayload(
  raw: Record<string, unknown> | undefined,
  providerDescription: string,
  existingMetadata?: Record<string, unknown> | null,
): TransactionMetadata {
  const metadata = (existingMetadata ?? {}) as TransactionMetadata;

  return {
    ...(raw ?? {}),
    userEdits: metadata.userEdits,
    providerDescription,
  };
}

async function updateSyncRunProgress(
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

function getRunAccountCursor(
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

async function updateRunAccountCursor(
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

async function markRunAccountCompleted(
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

function getRunCompletedAccountIds(cache: SyncRunMetadataCache) {
  return new Set(cache.get().enableBanking?.completedAccountIds ?? []);
}

async function reconcileAccountBalance(input: {
  householdId: string;
  financialAccountId: string;
  providerAccountId: string;
  currency: string;
  reportedBalance?: string;
}) {
  const offsetSourceTransactionId = `enable-banking-opening-balance:${input.providerAccountId}`;

  // Use SQL aggregation instead of loading all transactions into memory (P1-7)
  const [totals] = await db
    .select({
      totalSum: sql<string>`COALESCE(SUM(${transactions.amount}), 0)`,
      nonOffsetSum: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.sourceTransactionId} IS DISTINCT FROM ${offsetSourceTransactionId} THEN ${transactions.amount} ELSE 0 END), 0)`,
      manualCount: sql<number>`COUNT(CASE WHEN ${transactions.source} = 'manual' THEN 1 END)`,
    })
    .from(transactions)
    .where(eq(transactions.accountId, input.financialAccountId));

  // Check if an offset transaction already exists
  const [existingOffset] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, input.financialAccountId),
        eq(transactions.sourceTransactionId, offsetSourceTransactionId),
      ),
    )
    .limit(1);

  // Find earliest transaction date for offset placement
  const [earliest] = await db
    .select({ date: sql<string>`MIN(${transactions.date})` })
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, input.financialAccountId),
        sql`${transactions.sourceTransactionId} IS DISTINCT FROM ${offsetSourceTransactionId}`,
      ),
    );

  const transactionSumCents = toCents(totals?.nonOffsetSum ?? "0");
  const manualTransactionCount = totals?.manualCount ?? 0;
  const reportedBalanceCents =
    input.reportedBalance === undefined ? undefined : toCents(input.reportedBalance);
  const offsetCents =
    reportedBalanceCents === undefined
      ? 0
      : reportedBalanceCents - transactionSumCents;
  const earliestDate =
    earliest?.date ?? new Date().toISOString().slice(0, 10);
  const balanceMetadata = {
    source: "transactions",
    reportedBalance: input.reportedBalance,
    transactionSum: fromCents(transactionSumCents),
    offsetAmount: fromCents(offsetCents),
    manualTransactionsPresent: manualTransactionCount > 0,
    manualTransactionCount,
    discrepancy: offsetCents !== 0,
    updatedAt: new Date().toISOString(),
  };

  if (reportedBalanceCents === undefined) {
    const calculatedBalance = totals?.totalSum ?? "0";
    const [account] = await db
      .select({ metadata: financialAccounts.metadata })
      .from(financialAccounts)
      .where(eq(financialAccounts.id, input.financialAccountId))
      .limit(1);
    const metadata = account?.metadata ?? {};
    const existingBalanceMetadata =
      typeof metadata.balance === "object" && metadata.balance
        ? (metadata.balance as Record<string, unknown>)
        : {};

    await db
      .update(financialAccounts)
      .set({
        currentBalance: calculatedBalance,
        metadata: {
          ...metadata,
          balance: {
            ...existingBalanceMetadata,
            ...balanceMetadata,
            balanceUnavailable: true,
            calculatedBalance,
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(financialAccounts.id, input.financialAccountId));
    return;
  }

  if (offsetCents !== 0) {
    const values = {
      householdId: input.householdId,
      accountId: input.financialAccountId,
      source: "enable_banking" as const,
      sourceTransactionId: offsetSourceTransactionId,
      amount: fromCents(offsetCents),
      currency: input.currency,
      date: earliestDate,
      merchantName: "Opening balance adjustment",
      normalizedMerchantName: "opening balance adjustment",
      description: "Opening balance adjustment",
      searchText: "Opening balance adjustment",
      metadata: {
        kind: "opening_balance_offset",
        provider: "enable_banking",
        ...balanceMetadata,
      },
    };

    if (existingOffset) {
      await db
        .update(transactions)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(transactions.id, existingOffset.id));
    } else {
      await db.insert(transactions).values(values);
    }
  } else if (existingOffset) {
    await db.delete(transactions).where(eq(transactions.id, existingOffset.id));
  }

  const calculatedBalance =
    reportedBalanceCents === undefined
      ? fromCents(transactionSumCents)
      : fromCents(reportedBalanceCents);
  const [account] = await db
    .select({ metadata: financialAccounts.metadata })
    .from(financialAccounts)
    .where(eq(financialAccounts.id, input.financialAccountId))
    .limit(1);
  const metadata = account?.metadata ?? {};
  const existingBalanceMetadata =
    typeof metadata.balance === "object" && metadata.balance
      ? (metadata.balance as Record<string, unknown>)
      : {};

  await db
    .update(financialAccounts)
    .set({
      currentBalance: calculatedBalance,
      metadata: {
        ...metadata,
        balance: {
          ...existingBalanceMetadata,
          ...balanceMetadata,
          calculatedBalance,
        },
      },
      updatedAt: new Date(),
    })
    .where(eq(financialAccounts.id, input.financialAccountId));
}

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
    baseUrl: process.env.ENABLE_BANKING_BASE_URL,
  });
  const psuHeaders = getStoredPsuHeaders(connection.metadata);
  // Load metadata once per invocation (P1-8)
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

  try {
    const session = await client.getSession(connection.consentSessionId, psuHeaders);
    const sessionAccounts = session.accounts_data?.length
      ? session.accounts_data
      : session.accounts ?? [];
    const accounts = [];
    const importedTransactions = [];

    for (const sessionAccount of sessionAccounts) {
      const accountId = sessionAccountId(sessionAccount);
      const sessionAccountRecord = (
        typeof sessionAccount === "string" ? { uid: sessionAccount } : sessionAccount
      ) as {
        uid?: string;
        id?: string;
        currency?: string;
        balance?: {
          amount?: string;
          currency?: string;
        };
      };

      if (!accountId) {
        continue;
      }

      if (completedAccountIds.has(accountId)) {
        continue;
      }

      const [details, balances] = await Promise.all([
        client
          .getAccountDetails(accountId, psuHeaders)
          .catch((error) => {
            logger.warn("Enable Banking account details fallback used", {
              connectionId,
              accountId,
              error,
            });
            return sessionAccountRecord;
          }),
        client.getAccountBalances(accountId, psuHeaders).catch((error) => {
          logger.warn("Enable Banking account balance unavailable", {
            connectionId,
            accountId,
            error,
          });
          return undefined;
        }),
      ]);
      const reportedBalance =
        (balances ? firstBalanceAmount(balances) : undefined) ??
        details.balance?.amount ??
        sessionAccountRecord.balance?.amount;
      const account = mapEnableBankingAccount({
        ...details,
        uid: accountId,
        balance: reportedBalance
          ? {
              amount: reportedBalance,
              currency: details.currency ?? sessionAccountRecord.currency,
            }
          : details.balance ?? sessionAccountRecord.balance,
      });
      accounts.push(account);
      progress.currentAccountId = account.providerAccountId;
      progress.currentAccountName = account.name;
      await updateSyncRunProgress(metadataCache, options.syncRunId, progress);

      const [linkedProviderAccount] = await db
        .insert(providerAccounts)
        .values({
          connectionId,
          providerAccountId: account.providerAccountId,
          providerAccountName: account.name,
          currency: account.currency,
          lastBalance: reportedBalance ?? null,
          raw: account.raw,
        })
        .onConflictDoUpdate({
          target: [
            providerAccounts.connectionId,
            providerAccounts.providerAccountId,
          ],
          set: {
            providerAccountName: account.name,
            currency: account.currency,
            lastBalance: reportedBalance ?? null,
            raw: account.raw,
            updatedAt: new Date(),
          },
        })
        .returning();

      let financialAccountId = linkedProviderAccount.financialAccountId;

      if (!financialAccountId) {
        const [createdAccount] = await db
          .insert(financialAccounts)
          .values({
            householdId: connection.householdId,
            name: account.name,
            kind: account.kind ?? "checking",
            currency: account.currency,
            currentBalance: "0",
            isManual: false,
            institutionName:
              account.institutionName ?? session.aspsp?.name ?? "Enable Banking",
            metadata: {
              provider: "enable_banking",
              providerAccountId: account.providerAccountId,
            },
          })
          .returning();

        financialAccountId = createdAccount.id;

        await db
          .update(providerAccounts)
          .set({ financialAccountId, updatedAt: new Date() })
          .where(eq(providerAccounts.id, linkedProviderAccount.id));
      } else {
        await db
          .update(financialAccounts)
          .set({ currency: account.currency, updatedAt: new Date() })
          .where(eq(financialAccounts.id, financialAccountId));
      }

      let continuationKey = getRunAccountCursor(metadataCache, {
        providerAccountId: account.providerAccountId,
        params: transactionParams,
      });
      let hasMorePages = true;

      while (hasMorePages) {
        const transactionResponse = await client.getTransactions({
          accountId: account.providerAccountId,
          ...transactionParams,
          continuationKey,
          psuHeaders,
        });
        const normalizedTransactions = (
          transactionResponse.transactions ?? []
        ).map((transaction) =>
          mapEnableBankingTransaction(transaction, account.providerAccountId),
        );

        progress.pagesFetched += 1;
        pagesFetchedThisInvocation += 1;

        // Batch transaction processing: single lookup per page instead of O(n) (P1-6)
        if (normalizedTransactions.length > 0) {
          const sourceIds = normalizedTransactions
            .map((t) => t.providerTransactionId)
            .filter(Boolean) as string[];

          const existingRows =
            sourceIds.length > 0
              ? await db
                  .select({
                    id: transactions.id,
                    sourceTransactionId: transactions.sourceTransactionId,
                    description: transactions.description,
                    merchantName: transactions.merchantName,
                    metadata: transactions.metadata,
                  })
                  .from(transactions)
                  .where(
                    and(
                      eq(transactions.source, "enable_banking"),
                      eq(transactions.accountId, financialAccountId),
                      inArray(transactions.sourceTransactionId, sourceIds),
                    ),
                  )
              : [];

          const existingBySourceId = new Map(
            existingRows.map((row) => [row.sourceTransactionId, row]),
          );

          const toInsert: (typeof transactions.$inferInsert)[] = [];

          for (const transaction of normalizedTransactions) {
            const values = {
              householdId: connection.householdId,
              accountId: financialAccountId,
              source: "enable_banking" as const,
              sourceTransactionId: transaction.providerTransactionId,
              amount: transaction.amount,
              currency: transaction.currency,
              date: transaction.date,
              merchantName: transaction.merchantName,
              normalizedMerchantName: normalizeMerchant(
                transaction.merchantName ?? transaction.description,
              ),
              description: transaction.description,
              searchText: `${transaction.description} ${
                transaction.merchantName ?? ""
              }`,
              metadata: transaction.raw,
            };

            const existing = existingBySourceId.get(
              transaction.providerTransactionId,
            );

            if (existing) {
              const existingMetadata = (existing.metadata ??
                {}) as TransactionMetadata;
              const description = existingMetadata.userEdits?.descriptionEdited
                ? existing.description
                : transaction.description;
              const merchantName = existingMetadata.userEdits?.merchantNameEdited
                ? existing.merchantName
                : transaction.merchantName;

              await db
                .update(transactions)
                .set({
                  ...values,
                  description,
                  merchantName,
                  normalizedMerchantName: normalizeMerchant(
                    merchantName ?? description,
                  ),
                  searchText: `${description} ${merchantName ?? ""}`,
                  metadata: transactionMetadataWithProviderPayload(
                    transaction.raw,
                    transaction.description,
                    existing.metadata,
                  ),
                  updatedAt: new Date(),
                })
                .where(eq(transactions.id, existing.id));
            } else {
              toInsert.push({
                ...values,
                metadata: transactionMetadataWithProviderPayload(
                  transaction.raw,
                  transaction.description,
                ),
              });
            }
          }

          // Bulk insert new transactions
          if (toInsert.length > 0) {
            const inserted = await db
              .insert(transactions)
              .values(toInsert)
              .returning();

            importedTransactions.push(...inserted);
            progress.importedTransactions += inserted.length;
          }
        }

        continuationKey = transactionResponse.continuation_key ?? undefined;
        hasMorePages = Boolean(continuationKey);

        await db
          .update(providerAccounts)
          .set({
            syncCursor: continuationKey ?? null,
            updatedAt: new Date(),
          })
          .where(eq(providerAccounts.id, linkedProviderAccount.id));
        await updateRunAccountCursor(metadataCache, {
          syncRunId: options.syncRunId,
          providerAccountId: account.providerAccountId,
          params: transactionParams,
          continuationKey,
        });
        await updateSyncRunProgress(metadataCache, options.syncRunId, progress);

        if (hasMorePages && shouldPauseInvocation()) {
          return {
            accounts,
            transactions: importedTransactions.map((transaction) => ({
              providerTransactionId: transaction.sourceTransactionId ?? transaction.id,
              providerAccountId: transaction.accountId,
              amount: transaction.amount,
              currency: transaction.currency,
              date: transaction.date,
              merchantName: transaction.merchantName ?? undefined,
              description: transaction.description,
              raw: transaction.metadata ?? undefined,
            })),
            continuationRequired: true,
            progress,
          };
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
        return {
          accounts,
          transactions: importedTransactions.map((transaction) => ({
            providerTransactionId: transaction.sourceTransactionId ?? transaction.id,
            providerAccountId: transaction.accountId,
            amount: transaction.amount,
            currency: transaction.currency,
            date: transaction.date,
            merchantName: transaction.merchantName ?? undefined,
            description: transaction.description,
            raw: transaction.metadata ?? undefined,
          })),
          continuationRequired: true,
          progress,
        };
      }
    }

    const connectionMetadata = (connection.metadata ?? {}) as ConnectionMetadata;

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
      transactions: importedTransactions.map((transaction) => ({
        providerTransactionId: transaction.sourceTransactionId ?? transaction.id,
        providerAccountId: transaction.accountId,
        amount: transaction.amount,
        currency: transaction.currency,
        date: transaction.date,
        merchantName: transaction.merchantName ?? undefined,
        description: transaction.description,
        raw: transaction.metadata ?? undefined,
      })),
      progress,
    };
  } catch (error) {
    if (error instanceof EnableBankingRateLimitError) {
      const retryAt =
        error.retryAt ?? new Date(Date.now() + 6 * 60 * 60 * 1000);
      progress.rateLimitedUntil = retryAt.toISOString();
      await updateSyncRunProgress(metadataCache, options.syncRunId, progress);
      await db
        .update(ingestionConnections)
        .set({
          status: "rate_limited",
          rateLimitedUntil: retryAt,
          updatedAt: new Date(),
        })
        .where(eq(ingestionConnections.id, connectionId));

      return {
        accounts: [],
        transactions: [],
        rateLimitedUntil: retryAt,
        progress,
      };
    }

    throw error;
  }
}
