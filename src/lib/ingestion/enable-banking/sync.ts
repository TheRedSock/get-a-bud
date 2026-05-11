import { and, eq } from "drizzle-orm";

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

  throw new Error(
    "Enable Banking private key is not configured for this connection",
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

async function getOrCreateTransactionParams(
  connection: typeof ingestionConnections.$inferSelect,
  syncRunId?: string,
): Promise<TransactionSyncParams> {
  if (syncRunId) {
    const metadata = await getRunMetadata(syncRunId);
    const existing = metadata.enableBanking?.transactionParams;

    if (existing) {
      return existing;
    }
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

  if (syncRunId) {
    const metadata = await getRunMetadata(syncRunId);

    await db
      .update(syncRuns)
      .set({
        metadata: {
          ...metadata,
          enableBanking: {
            ...(metadata.enableBanking ?? {}),
            transactionParams: params,
          },
        },
      })
      .where(eq(syncRuns.id, syncRunId));
  }

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

async function updateSyncRunProgress(syncRunId: string | undefined, progress: SyncProgress) {
  if (!syncRunId) {
    return;
  }

  const metadata = await getRunMetadata(syncRunId);

  await db
    .update(syncRuns)
    .set({
      importedAccounts: progress.importedAccounts,
      importedTransactions: progress.importedTransactions,
      metadata: {
        ...metadata,
        enableBanking: {
          ...(metadata.enableBanking ?? {}),
          progress,
        },
      },
    })
    .where(eq(syncRuns.id, syncRunId));
}

async function getRunAccountCursor(input: {
  syncRunId?: string;
  providerAccountId: string;
  params: TransactionSyncParams;
}) {
  if (!input.syncRunId) {
    return undefined;
  }

  const metadata = await getRunMetadata(input.syncRunId);
  const cursor =
    metadata.enableBanking?.accountCursors?.[input.providerAccountId];

  if (!cursor || cursor.paramsKey !== transactionParamsKey(input.params)) {
    return undefined;
  }

  return cursor.continuationKey;
}

async function updateRunAccountCursor(input: {
  syncRunId?: string;
  providerAccountId: string;
  params: TransactionSyncParams;
  continuationKey?: string;
}) {
  if (!input.syncRunId) {
    return;
  }

  const metadata = await getRunMetadata(input.syncRunId);
  const accountCursors = {
    ...(metadata.enableBanking?.accountCursors ?? {}),
  };

  if (input.continuationKey) {
    accountCursors[input.providerAccountId] = {
      continuationKey: input.continuationKey,
      paramsKey: transactionParamsKey(input.params),
    };
  } else {
    delete accountCursors[input.providerAccountId];
  }

  await db
    .update(syncRuns)
    .set({
      metadata: {
        ...metadata,
        enableBanking: {
          ...(metadata.enableBanking ?? {}),
          accountCursors,
        },
      },
    })
    .where(eq(syncRuns.id, input.syncRunId));
}

async function reconcileAccountBalance(input: {
  householdId: string;
  financialAccountId: string;
  providerAccountId: string;
  currency: string;
  reportedBalance?: string;
}) {
  const offsetSourceTransactionId = `enable-banking-opening-balance:${input.providerAccountId}`;
  const rows = await db
    .select()
    .from(transactions)
    .where(eq(transactions.accountId, input.financialAccountId));
  const existingOffset = rows.find(
    (transaction) => transaction.sourceTransactionId === offsetSourceTransactionId,
  );
  const nonOffsetRows = rows.filter(
    (transaction) => transaction.sourceTransactionId !== offsetSourceTransactionId,
  );
  const manualTransactions = nonOffsetRows.filter(
    (transaction) => transaction.source === "manual",
  );
  const transactionSumCents = nonOffsetRows.reduce(
    (sum, transaction) => sum + toCents(transaction.amount),
    0,
  );
  const reportedBalanceCents =
    input.reportedBalance === undefined ? undefined : toCents(input.reportedBalance);
  const offsetCents =
    reportedBalanceCents === undefined
      ? 0
      : reportedBalanceCents - transactionSumCents;
  const earliestDate =
    nonOffsetRows
      .map((transaction) => transaction.date)
      .sort((left, right) => left.localeCompare(right))[0] ??
    new Date().toISOString().slice(0, 10);
  const balanceMetadata = {
    source: "transactions",
    reportedBalance: input.reportedBalance,
    transactionSum: fromCents(transactionSumCents),
    offsetAmount: fromCents(offsetCents),
    manualTransactionsPresent: manualTransactions.length > 0,
    manualTransactionCount: manualTransactions.length,
    discrepancy: offsetCents !== 0,
    updatedAt: new Date().toISOString(),
  };

  if (reportedBalanceCents === undefined) {
    const calculatedBalance = fromCents(
      rows.reduce((sum, transaction) => sum + toCents(transaction.amount), 0),
    );
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
  options: { syncRunId?: string } = {},
): Promise<IngestionSyncResult> {
  const [connection] = await db
    .select()
    .from(ingestionConnections)
    .where(eq(ingestionConnections.id, connectionId))
    .limit(1);

  if (!connection) {
    throw new Error("Enable Banking connection not found");
  }

  if (!connection.consentSessionId) {
    throw new Error("Enable Banking connection is missing a consent session id");
  }

  if (!connection.externalApplicationId) {
    throw new Error("Enable Banking connection is missing an application id");
  }

  const client = new EnableBankingClient({
    applicationId: connection.externalApplicationId,
    pemPrivateKey: await resolvePrivateKey(connection),
    baseUrl: process.env.ENABLE_BANKING_BASE_URL,
  });
  const psuHeaders = getStoredPsuHeaders(connection.metadata);
  const transactionParams = await getOrCreateTransactionParams(
    connection,
    options.syncRunId,
  );
  const progress: SyncProgress = {
    importedAccounts: 0,
    importedTransactions: 0,
    pagesFetched: 0,
  };

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
      await updateSyncRunProgress(options.syncRunId, progress);

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

      let continuationKey = await getRunAccountCursor({
        syncRunId: options.syncRunId,
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
          const [existing] = await db
            .select({
              id: transactions.id,
              description: transactions.description,
              merchantName: transactions.merchantName,
              metadata: transactions.metadata,
            })
            .from(transactions)
            .where(
              and(
                eq(transactions.source, "enable_banking"),
                eq(transactions.sourceTransactionId, transaction.providerTransactionId),
                eq(transactions.accountId, financialAccountId),
              ),
            )
            .limit(1);

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
            continue;
          }

          const [createdTransaction] = await db
            .insert(transactions)
            .values({
              ...values,
              metadata: transactionMetadataWithProviderPayload(
                transaction.raw,
                transaction.description,
              ),
            })
            .returning();

          importedTransactions.push(createdTransaction);
          progress.importedTransactions += 1;
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
        await updateRunAccountCursor({
          syncRunId: options.syncRunId,
          providerAccountId: account.providerAccountId,
          params: transactionParams,
          continuationKey,
        });
        await updateSyncRunProgress(options.syncRunId, progress);
      }

      progress.importedAccounts += 1;
      await reconcileAccountBalance({
        householdId: connection.householdId,
        financialAccountId,
        providerAccountId: account.providerAccountId,
        currency: account.currency,
        reportedBalance,
      });
      await updateSyncRunProgress(options.syncRunId, progress);
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
      await updateSyncRunProgress(options.syncRunId, progress);
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
