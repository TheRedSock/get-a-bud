import { configurationError } from "@/lib/errors/catalog";
import type { EnableBankingClient } from "@/lib/ingestion/enable-banking/client";
import { parseConnectionMetadata } from "@/lib/ingestion/enable-banking/metadata-schemas";
import type { PsuHeaders } from "@/lib/ingestion/enable-banking/psu-headers";
import { decryptSecret } from "@/lib/security/encryption";
import type { ingestionConnections } from "@/db/schema";

export function dateDaysBefore(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() - days);
  return result.toISOString().slice(0, 10);
}

export function transactionParamsKey(
  params: import("@/lib/ingestion/enable-banking/types").TransactionSyncParams,
) {
  return JSON.stringify({
    dateFrom: params.dateFrom ?? null,
    dateTo: params.dateTo ?? null,
    strategy: params.strategy,
    transactionStatus: params.transactionStatus,
  });
}

export async function resolvePrivateKey(
  connection: typeof ingestionConnections.$inferSelect,
) {
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

export function getStoredPsuHeaders(
  metadata: Record<string, unknown> | null | undefined,
): PsuHeaders | undefined {
  const parsed = parseConnectionMetadata(metadata, {});
  const psuHeaders = parsed.psuHeaders;

  if (!psuHeaders) {
    return undefined;
  }

  return psuHeaders as PsuHeaders;
}

export function firstBalanceAmount(
  response: Awaited<ReturnType<EnableBankingClient["getAccountBalances"]>>,
) {
  const balance = response.balances?.[0];

  return balance?.balance_amount?.amount ?? balance?.amount?.amount;
}

export function sessionAccountId(
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
