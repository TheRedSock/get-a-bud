import { eq } from "drizzle-orm";

import { db } from "@/db";
import { financialAccounts, providerAccounts } from "@/db/schema";
import {
  EnableBankingClient,
  mapEnableBankingAccount,
} from "@/lib/ingestion/enable-banking/client";
import { firstBalanceAmount } from "@/lib/ingestion/enable-banking/connection-helpers";
import { parseMoneyToCents } from "@/lib/finance/money";
import type { NormalizedAccount } from "@/lib/ingestion/types";
import { logger } from "@/lib/logger";

export type SessionAccountRecord = {
  uid?: string;
  id?: string;
  currency?: string;
  balance?: {
    amount?: string;
    currency?: string;
  };
};

export async function upsertEnableBankingAccount(input: {
  connectionId: string;
  householdId: string;
  institutionName?: string;
  client: EnableBankingClient;
  accountId: string;
  sessionAccountRecord: SessionAccountRecord;
  psuHeaders: Record<string, string> | undefined;
}): Promise<{
  account: NormalizedAccount;
  financialAccountId: string;
  reportedBalance: string | undefined;
}> {
  const [details, balances] = await Promise.all([
    input.client
      .getAccountDetails(input.accountId, input.psuHeaders)
      .catch((error) => {
        logger.warn("Enable Banking account details fallback used", {
          connectionId: input.connectionId,
          accountId: input.accountId,
          error,
        });
        return input.sessionAccountRecord;
      }),
    input.client.getAccountBalances(input.accountId, input.psuHeaders).catch((error) => {
      logger.warn("Enable Banking account balance unavailable", {
        connectionId: input.connectionId,
        accountId: input.accountId,
        error,
      });
      return undefined;
    }),
  ]);

  const reportedBalance =
    (balances ? firstBalanceAmount(balances) : undefined) ??
    details.balance?.amount ??
    input.sessionAccountRecord.balance?.amount;

  const account = mapEnableBankingAccount({
    ...details,
    uid: input.accountId,
    balance: reportedBalance
      ? {
          amount: reportedBalance,
          currency: details.currency ?? input.sessionAccountRecord.currency,
        }
      : details.balance ?? input.sessionAccountRecord.balance,
  });

  const [linkedProviderAccount] = await db
    .insert(providerAccounts)
    .values({
      connectionId: input.connectionId,
      providerAccountId: account.providerAccountId,
      providerAccountName: account.name,
      currency: account.currency,
      lastBalanceCents: reportedBalance ? parseMoneyToCents(reportedBalance) : null,
      raw: account.raw,
    })
    .onConflictDoUpdate({
      target: [providerAccounts.connectionId, providerAccounts.providerAccountId],
      set: {
        providerAccountName: account.name,
        currency: account.currency,
        lastBalanceCents: reportedBalance ? parseMoneyToCents(reportedBalance) : null,
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
        householdId: input.householdId,
        name: account.name,
        kind: account.kind ?? "checking",
        currency: account.currency,
        currentBalanceCents: 0,
        isManual: false,
        institutionName: account.institutionName ?? input.institutionName ?? "Enable Banking",
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

  return { account, financialAccountId, reportedBalance };
}
