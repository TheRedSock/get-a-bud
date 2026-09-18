import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { transactions } from "@/db/schema";
import { parseDescription } from "@/lib/classification/parser";
import type { ParserResult } from "@/lib/classification/parser/types";
import { parseNorwegianDecimal } from "@/lib/classification/parser/norwegian";
import { normalizeMerchant, stripPaypalReferenceSuffix } from "@/lib/finance/categorization";
import { parseMoneyToCents } from "@/lib/finance/money";
import {
  EnableBankingClient,
  mapEnableBankingTransaction,
} from "@/lib/ingestion/enable-banking/client";
import { transactionMetadataWithProviderPayload } from "@/lib/ingestion/enable-banking/metadata";
import { parseTransactionMetadata } from "@/lib/ingestion/enable-banking/metadata-schemas";
import type { SyncRunMetadataCache } from "@/lib/ingestion/enable-banking/metadata";
import {
  updateRunAccountCursor,
  updateSyncRunProgress,
} from "@/lib/ingestion/enable-banking/sync-progress";
import type { SyncProgress, TransactionSyncParams } from "@/lib/ingestion/enable-banking/types";
import type { NormalizedAccount, NormalizedTransaction } from "@/lib/ingestion/types";

type ExistingTransactionRow = {
  id: string;
  sourceTransactionId: string | null;
  description: string;
  merchantName: string | null;
  amountCents: number;
  currency: string;
  date: string;
  metadata: Record<string, unknown> | null;
};

export function buildProviderTransactionInsertValues(input: {
  householdId: string;
  financialAccountId: string;
  transaction: NormalizedTransaction;
  merchantName: string | null;
  parsed: ParserResult | null;
  /** Override for normalization — use when PayPal reference codes are stripped. */
  normalizedMerchantSource?: string | null;
}): typeof transactions.$inferInsert {
  const { transaction, merchantName, parsed, householdId, financialAccountId } =
    input;
  const normSource = input.normalizedMerchantSource ?? merchantName;

  const values: typeof transactions.$inferInsert = {
    householdId,
    accountId: financialAccountId,
    source: "enable_banking",
    sourceTransactionId: transaction.providerTransactionId,
    amountCents: transaction.amountCents,
    currency: transaction.currency,
    date: transaction.date,
    merchantName,
    normalizedMerchantName: normalizeMerchant(
      normSource ?? transaction.description,
    ),
    description: transaction.description,
    searchText: `${transaction.description} ${merchantName ?? ""}`,
    metadata: transaction.raw,
    transactionType: parsed?.transactionType ?? null,
    paymentChannel: parsed?.paymentChannel ?? null,
    parserSource: parsed ? "norwegian" : null,
  };

  if (parsed?.metadata?.originalCurrency && parsed?.metadata?.originalAmount) {
    values.originalCurrency = String(parsed.metadata.originalCurrency).toUpperCase();
    values.originalAmountCents = parseMoneyToCents(
      parseNorwegianDecimal(String(parsed.metadata.originalAmount)),
    );
  }

  return values;
}

/**
 * Patch for an existing synced row. Provider-owned facts (amount, currency,
 * date, account) are never updated on re-import.
 */
export function buildExistingTransactionSyncPatch(input: {
  existing: ExistingTransactionRow;
  transaction: NormalizedTransaction;
  merchantName: string | null;
  parsed: ParserResult | null;
  parsedExchangeRate?: string | number;
  /** Override for normalization — use when PayPal reference codes are stripped. */
  normalizedMerchantSource?: string | null;
}): Partial<typeof transactions.$inferInsert> {
  const { existing, transaction, merchantName, parsed, parsedExchangeRate } =
    input;
  const existingMetadata = parseTransactionMetadata(existing.metadata, {
    transactionId: existing.id,
  });

  const description = existingMetadata.userEdits?.descriptionEdited
    ? existing.description
    : transaction.description;
  const resolvedMerchant = existingMetadata.userEdits?.merchantNameEdited
    ? existing.merchantName
    : merchantName;
  const normSource = existingMetadata.userEdits?.merchantNameEdited
    ? existing.merchantName
    : (input.normalizedMerchantSource ?? merchantName);

  const patch: Partial<typeof transactions.$inferInsert> = {
    description,
    merchantName: resolvedMerchant,
    normalizedMerchantName: normalizeMerchant(normSource ?? description),
    searchText: `${description} ${resolvedMerchant ?? ""}`,
    transactionType: parsed?.transactionType ?? null,
    paymentChannel: parsed?.paymentChannel ?? null,
    parserSource: parsed ? "norwegian" : null,
    metadata: {
      ...transactionMetadataWithProviderPayload(
        transaction.raw,
        transaction.description,
        merchantName,
        transaction.merchantName,
        existing.metadata,
        parsed,
      ),
      ...(parsedExchangeRate != null ? { exchangeRate: parsedExchangeRate } : {}),
    },
    updatedAt: new Date(),
  };

  if (
    !existingMetadata.userEdits?.descriptionEdited &&
    parsed?.metadata?.originalCurrency &&
    parsed?.metadata?.originalAmount
  ) {
    patch.originalCurrency = String(parsed.metadata.originalCurrency).toUpperCase();
    patch.originalAmountCents = parseMoneyToCents(
      parseNorwegianDecimal(String(parsed.metadata.originalAmount)),
    );
  }

  return patch;
}

export async function syncEnableBankingTransactionPage(input: {
  client: EnableBankingClient;
  account: NormalizedAccount;
  financialAccountId: string;
  householdId: string;
  transactionParams: TransactionSyncParams;
  continuationKey?: string;
  psuHeaders: Record<string, string> | undefined;
  metadataCache: SyncRunMetadataCache;
  syncRunId?: string;
  progress: SyncProgress;
  aspspCountry?: string;
}): Promise<{
  imported: (typeof transactions.$inferSelect)[];
  continuationKey?: string;
  hasMorePages: boolean;
}> {
  const transactionResponse = await input.client.getTransactions({
    accountId: input.account.providerAccountId,
    ...input.transactionParams,
    continuationKey: input.continuationKey,
    psuHeaders: input.psuHeaders,
  });

  const normalizedTransactions = (transactionResponse.transactions ?? []).map(
    (transaction) =>
      mapEnableBankingTransaction(transaction, input.account.providerAccountId),
  );

  input.progress.pagesFetched += 1;
  const imported: (typeof transactions.$inferSelect)[] = [];

  if (normalizedTransactions.length > 0) {
    const sourceIds = normalizedTransactions
      .map((t) => t.providerTransactionId)
      .filter(Boolean) as string[];

    const existingRows: ExistingTransactionRow[] =
      sourceIds.length > 0
        ? await db
            .select({
              id: transactions.id,
              sourceTransactionId: transactions.sourceTransactionId,
              description: transactions.description,
              merchantName: transactions.merchantName,
              amountCents: transactions.amountCents,
              currency: transactions.currency,
              date: transactions.date,
              metadata: transactions.metadata,
            })
            .from(transactions)
            .where(
              and(
                eq(transactions.source, "enable_banking"),
                eq(transactions.accountId, input.financialAccountId),
                inArray(transactions.sourceTransactionId, sourceIds),
              ),
            )
        : [];

    const existingBySourceId = new Map(
      existingRows.map((row) => [row.sourceTransactionId, row]),
    );

    const toInsert: (typeof transactions.$inferInsert)[] = [];

    for (const transaction of normalizedTransactions) {
      const parsed = parseDescription(
        transaction.description,
        "enable_banking",
        { country: input.aspspCountry },
      );
      const merchantName =
        transaction.merchantName ?? parsed?.merchantName ?? null;
      // For PayPal transactions, strip rotating reference codes (":P3", ":P4")
      // from the normalized merchant name so that the same subscription always
      // resolves to a single merchant identity regardless of reference rotation.
      const isPaypal = parsed?.paymentChannel === "paypal" ||
        /paypal\s*:/i.test(merchantName ?? "") ||
        /paypal\s*:/i.test(transaction.description);
      const normalizedSource = isPaypal
        ? stripPaypalReferenceSuffix(merchantName ?? transaction.description)
        : merchantName;
      const parsedExchangeRate = parsed?.metadata?.exchangeRate
        ? parseNorwegianDecimal(String(parsed.metadata.exchangeRate))
        : undefined;

      const existing = existingBySourceId.get(transaction.providerTransactionId);

      if (existing) {
        const patch = buildExistingTransactionSyncPatch({
          existing,
          transaction,
          merchantName,
          parsed,
          parsedExchangeRate,
          normalizedMerchantSource: normalizedSource,
        });

        await db
          .update(transactions)
          .set(patch)
          .where(eq(transactions.id, existing.id));
      } else {
        const values = buildProviderTransactionInsertValues({
          householdId: input.householdId,
          financialAccountId: input.financialAccountId,
          transaction,
          merchantName,
          parsed,
          normalizedMerchantSource: normalizedSource,
        });

        toInsert.push({
          ...values,
          metadata: {
            ...transactionMetadataWithProviderPayload(
              transaction.raw,
              transaction.description,
              merchantName,
              transaction.merchantName,
              undefined,
              parsed,
            ),
            ...(parsedExchangeRate != null
              ? { exchangeRate: parsedExchangeRate }
              : {}),
          },
        });
      }
    }

    if (toInsert.length > 0) {
      const inserted = await db.insert(transactions).values(toInsert).returning();
      imported.push(...inserted);
      input.progress.importedTransactions += inserted.length;
    }
  }

  const continuationKey = transactionResponse.continuation_key ?? undefined;
  const hasMorePages = Boolean(continuationKey);

  await updateRunAccountCursor(input.metadataCache, {
    syncRunId: input.syncRunId,
    providerAccountId: input.account.providerAccountId,
    params: input.transactionParams,
    continuationKey,
  });
  await updateSyncRunProgress(
    input.metadataCache,
    input.syncRunId,
    input.progress,
  );

  return { imported, continuationKey, hasMorePages };
}

export function mapImportedTransactionsForResult(
  rows: Array<{
    sourceTransactionId: string | null;
    id: string;
    accountId: string;
    amountCents: number;
    currency: string;
    date: string;
    merchantName: string | null;
    description: string;
    metadata: Record<string, unknown> | null;
  }>,
): NormalizedTransaction[] {
  return rows.map((transaction) => ({
    providerTransactionId: transaction.sourceTransactionId ?? transaction.id,
    providerAccountId: transaction.accountId,
    amountCents: transaction.amountCents,
    currency: transaction.currency,
    date: transaction.date,
    merchantName: transaction.merchantName ?? undefined,
    description: transaction.description,
    raw: transaction.metadata ?? undefined,
  }));
}
