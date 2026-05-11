import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  financialAccounts,
  ingestionConnections,
  providerAccounts,
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

function dateDaysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
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

  return (
    balance?.balance_amount?.amount ??
    balance?.amount?.amount ??
    "0"
  );
}

export async function syncEnableBankingConnection(
  connectionId: string,
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

  try {
    const session = await client.getSession(connection.consentSessionId, psuHeaders);
    const sessionAccounts = session.accounts_data?.length
      ? session.accounts_data
      : (session.accounts ?? []).map((uid) => ({ uid }));
    const accounts = [];
    const importedTransactions = [];

    for (const sessionAccount of sessionAccounts) {
      const sessionAccountRecord = sessionAccount as {
        uid?: string;
        id?: string;
        currency?: string;
        balance?: {
          amount?: string;
          currency?: string;
        };
      };
      const accountId = sessionAccountRecord.uid ?? sessionAccountRecord.id;

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
      const account = mapEnableBankingAccount({
        ...details,
        uid: accountId,
        balance: balances
          ? {
              amount: firstBalanceAmount(balances),
              currency: details.currency ?? sessionAccountRecord.currency,
            }
          : details.balance ?? sessionAccountRecord.balance,
      });
      accounts.push(account);

      const [linkedProviderAccount] = await db
        .insert(providerAccounts)
        .values({
          connectionId,
          providerAccountId: account.providerAccountId,
          providerAccountName: account.name,
          currency: account.currency,
          lastBalance: account.balance,
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
            lastBalance: account.balance,
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
            currentBalance: account.balance,
            isManual: false,
            institutionName: "Enable Banking",
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
          .set({ currentBalance: account.balance, updatedAt: new Date() })
          .where(eq(financialAccounts.id, financialAccountId));
      }

      const transactionResponse = await client.getTransactions({
        accountId: account.providerAccountId,
        dateFrom: dateDaysAgo(90),
        dateTo: new Date().toISOString().slice(0, 10),
        continuationKey: linkedProviderAccount.syncCursor ?? undefined,
        psuHeaders,
      });

      const normalizedTransactions = (
        transactionResponse.transactions ?? []
      ).map((transaction) =>
        mapEnableBankingTransaction(transaction, account.providerAccountId),
      );

      for (const transaction of normalizedTransactions) {
        const [existing] = await db
          .select({ id: transactions.id })
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
          continue;
        }

        const [createdTransaction] = await db
          .insert(transactions)
          .values({
            householdId: connection.householdId,
            accountId: financialAccountId,
            source: "enable_banking",
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
          })
          .returning();

        importedTransactions.push(createdTransaction);
      }

      await db
        .update(providerAccounts)
        .set({
          syncCursor: transactionResponse.continuation_key,
          updatedAt: new Date(),
        })
        .where(eq(providerAccounts.id, linkedProviderAccount.id));
    }

    await db
      .update(ingestionConnections)
      .set({ lastSyncedAt: new Date(), status: "connected", updatedAt: new Date() })
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
    };
  } catch (error) {
    if (error instanceof EnableBankingRateLimitError) {
      await db
        .update(ingestionConnections)
        .set({
          status: "rate_limited",
          rateLimitedUntil: error.retryAt,
          updatedAt: new Date(),
        })
        .where(eq(ingestionConnections.id, connectionId));

      return {
        accounts: [],
        transactions: [],
        rateLimitedUntil: error.retryAt,
      };
    }

    throw error;
  }
}
