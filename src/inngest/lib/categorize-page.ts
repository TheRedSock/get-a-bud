import { and, asc, eq, gt, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import { transactions } from "@/db/schema";
import { getBootstrapSuggestions } from "@/lib/classification/bootstrap";
import type { ParsedDescription } from "@/lib/classification/parser/types";
import { parseTransactionMetadata } from "@/lib/ingestion/enable-banking/metadata-schemas";
import {
  classifyTransaction,
  loadModelFromJson,
} from "@/lib/classification/model";
import { detectCategory, normalizeMerchant } from "@/lib/finance/categorization";
import { resolveMerchantIdentity } from "@/lib/finance/merchants";
import { generateRelabel, type AutoLabelMetadata } from "@/lib/classification/relabel";
import {
  loadHouseholdModelData,
  merchantIdentityUpdates,
} from "@/inngest/lib/categorization-job";

const PAGE_SIZE = 100;

const categorizePageColumns = {
  id: transactions.id,
  householdId: transactions.householdId,
  accountId: transactions.accountId,
  source: transactions.source,
  description: transactions.description,
  merchantName: transactions.merchantName,
  normalizedMerchantName: transactions.normalizedMerchantName,
  transactionType: transactions.transactionType,
  paymentChannel: transactions.paymentChannel,
  metadata: transactions.metadata,
  categoryId: transactions.categoryId,
  amountCents: transactions.amountCents,
  date: transactions.date,
  originalCurrency: transactions.originalCurrency,
  notes: transactions.notes,
};

type CategorizePageRow = {
  id: string;
  householdId: string;
  accountId: string;
  source: string;
  description: string;
  merchantName: string | null;
  normalizedMerchantName: string | null;
  transactionType: string | null;
  paymentChannel: string | null;
  metadata: Record<string, unknown> | null;
  categoryId: string | null;
  amountCents: number;
  date: string;
  originalCurrency: string | null;
  notes: string | null;
};

function counterpartyFromMetadata(metadata: unknown): string | null {
  const parsed = parseTransactionMetadata(metadata, {});
  const counterparty = parsed.parsed?.counterparty;
  return typeof counterparty === "string" ? counterparty : null;
}

function parsedDescriptionFromMetadata(
  metadata: unknown,
  transactionId: string,
): ParsedDescription | null {
  const parsed = parseTransactionMetadata(metadata, { transactionId }).parsed;
  if (!parsed) return null;
  return parsed as ParsedDescription;
}

export type CategorizePageOptions = {
  afterId?: string;
  accountIds?: string[];
};

async function persistCategorizeUpdate(
  transactionId: string,
  values: Partial<typeof transactions.$inferInsert>,
) {
  if (Object.keys(values).length === 0) {
    return;
  }

  await db
    .update(transactions)
    .set(values)
    .where(
      and(
        eq(transactions.id, transactionId),
        isNull(transactions.categoryId),
      ),
    );
}

export async function categorizeTransactionPage(
  householdId: string,
  options: CategorizePageOptions = {},
) {
  const { afterId, accountIds } = options;
  const rows = (await db
    .select(categorizePageColumns)
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, householdId),
        isNull(transactions.categoryId),
        afterId ? gt(transactions.id, afterId) : undefined,
        accountIds?.length
          ? inArray(transactions.accountId, accountIds)
          : undefined,
      ),
    )
    .orderBy(asc(transactions.id))
    .limit(PAGE_SIZE)) as CategorizePageRow[];

  const lastScannedId = rows.at(-1)?.id;
  const modelRow = await loadHouseholdModelData(householdId);

  let model = null;
  if (modelRow) {
    try {
      model = loadModelFromJson(modelRow.modelJson, modelRow.thresholds);
    } catch {
      model = null;
    }
  }

  let updated = 0;
  let tier1 = 0;
  let tier2 = 0;
  let suggested = 0;
  let bootstrapSuggested = 0;

  const bootstrapSuggestions = await getBootstrapSuggestions({
    householdId,
    transactions: rows.map((transaction) => ({
      id: transaction.id,
      householdId: transaction.householdId,
      source: transaction.source,
      description: transaction.description,
      merchantName: transaction.merchantName,
      normalizedMerchantName: transaction.normalizedMerchantName,
      transactionType: transaction.transactionType,
      paymentChannel: transaction.paymentChannel,
      metadata: transaction.metadata,
    })),
  });

  for (const transaction of rows.filter((row) => !row.categoryId)) {
    const merchantResolution = await resolveMerchantIdentity({
      householdId: transaction.householdId,
      transaction: {
        id: transaction.id,
        householdId: transaction.householdId,
        source: transaction.source,
        description: transaction.description,
        merchantName: transaction.merchantName,
        normalizedMerchantName: transaction.normalizedMerchantName,
        transactionType: transaction.transactionType,
        paymentChannel: transaction.paymentChannel,
        metadata: transaction.metadata,
      },
    });
    const identityUpdates = merchantIdentityUpdates(
      transaction,
      merchantResolution,
    );

    let pendingUpdate: Partial<typeof transactions.$inferInsert> = {
      ...identityUpdates,
    };
    let appliedCategory = false;
    let madeSuggestion = false;

    if (merchantResolution?.defaultCategoryId) {
      const nextDescription =
        pendingUpdate.description ?? transaction.description;
      const nextMerchantName =
        pendingUpdate.merchantName !== undefined
          ? pendingUpdate.merchantName
          : transaction.merchantName;
      const autoLabel: AutoLabelMetadata = {
        appliedAt: new Date().toISOString(),
        source: "merchant",
        confidence: Math.min(merchantResolution.confidence, 0.95),
        originalDescription: transaction.description,
        originalMerchantName: transaction.merchantName,
        appliedDescription: nextDescription,
        appliedMerchantName: nextMerchantName ?? null,
        appliedCategoryId: merchantResolution.defaultCategoryId,
        undone: false,
      };

      pendingUpdate = {
        ...pendingUpdate,
        categoryId: merchantResolution.defaultCategoryId,
        categorySource: "merchant",
        categoryConfidence: Math.min(merchantResolution.confidence, 0.95).toFixed(
          2,
        ),
        suggestedCategoryId: null,
        suggestedDescription: null,
        suggestedMerchantName: null,
        metadata: {
          ...(transaction.metadata ?? {}),
          autoLabel,
        },
      };
      appliedCategory = true;
      tier1 += 1;
    } else {
      const result = await detectCategory(
        transaction.householdId,
        transaction.description,
        transaction.merchantName,
        {
          normalizedMerchantName: transaction.normalizedMerchantName,
          counterparty: counterpartyFromMetadata(transaction.metadata),
        },
      );

      if (result) {
        const parsedMeta = parsedDescriptionFromMetadata(
          transaction.metadata,
          transaction.id,
        );
        const relabel = generateRelabel(parsedMeta, {
          description: transaction.description,
          merchantName: transaction.merchantName,
          metadata: transaction.metadata,
        });

        pendingUpdate = {
          ...pendingUpdate,
          categoryId: result.categoryId,
          categorySource: result.source,
          categoryConfidence: result.confidence.toFixed(2),
          suggestedCategoryId: null,
          suggestedDescription: null,
          suggestedMerchantName: null,
        };

        if (relabel) {
          const autoLabel: AutoLabelMetadata = {
            appliedAt: new Date().toISOString(),
            source: "rule",
            confidence: result.confidence,
            originalDescription: transaction.description,
            originalMerchantName: transaction.merchantName,
            appliedDescription: relabel.description,
            appliedMerchantName: relabel.merchantName,
            appliedCategoryId: result.categoryId,
            undone: false,
          };
          pendingUpdate.description = relabel.description;
          pendingUpdate.merchantName = relabel.merchantName;
          pendingUpdate.normalizedMerchantName = normalizeMerchant(
            relabel.merchantName ?? relabel.description,
          );
          pendingUpdate.searchText = `${relabel.description} ${relabel.merchantName ?? ""}`;
          if (relabel.notes && !transaction.notes) {
            pendingUpdate.notes = relabel.notes;
          }
          pendingUpdate.metadata = {
            ...(transaction.metadata ?? {}),
            autoLabel,
          };
        }

        appliedCategory = true;
        tier1 += 1;
      } else if (model) {
        const prediction = classifyTransaction(model, {
          description: transaction.description,
          merchantName: transaction.merchantName,
          normalizedMerchantName: transaction.normalizedMerchantName,
          amountCents: transaction.amountCents,
          date: transaction.date,
          transactionType: transaction.transactionType,
          paymentChannel: transaction.paymentChannel,
          originalCurrency: transaction.originalCurrency,
        });

        if (prediction) {
          if (
            model.thresholds.autoApplyThreshold !== null &&
            prediction.score >= model.thresholds.autoApplyThreshold
          ) {
            const parsedMeta = parsedDescriptionFromMetadata(
              transaction.metadata,
              transaction.id,
            );
            const relabel = generateRelabel(parsedMeta, {
              description: transaction.description,
              merchantName: transaction.merchantName,
              metadata: transaction.metadata,
            });

            pendingUpdate = {
              ...pendingUpdate,
              categoryId: prediction.label,
              categorySource: "model",
              categoryConfidence: prediction.score.toFixed(2),
              suggestedCategoryId: null,
              suggestedDescription: null,
              suggestedMerchantName: null,
            };

            if (relabel) {
              const autoLabel: AutoLabelMetadata = {
                appliedAt: new Date().toISOString(),
                source: "model",
                confidence: prediction.score,
                originalDescription: transaction.description,
                originalMerchantName: transaction.merchantName,
                appliedDescription: relabel.description,
                appliedMerchantName: relabel.merchantName,
                appliedCategoryId: prediction.label,
                undone: false,
              };
              pendingUpdate.description = relabel.description;
              pendingUpdate.merchantName = relabel.merchantName;
              pendingUpdate.normalizedMerchantName = normalizeMerchant(
                relabel.merchantName ?? relabel.description,
              );
              pendingUpdate.searchText = `${relabel.description} ${relabel.merchantName ?? ""}`;
              if (relabel.notes && !transaction.notes) {
                pendingUpdate.notes = relabel.notes;
              }
              pendingUpdate.metadata = {
                ...(transaction.metadata ?? {}),
                autoLabel,
              };
            }

            appliedCategory = true;
            tier2 += 1;
          } else if (
            model.thresholds.suggestThreshold !== null &&
            prediction.score >= model.thresholds.suggestThreshold
          ) {
            const parsedMeta = parsedDescriptionFromMetadata(
              transaction.metadata,
              transaction.id,
            );
            const relabel = generateRelabel(parsedMeta, {
              description: transaction.description,
              merchantName: transaction.merchantName,
              metadata: transaction.metadata,
            });

            pendingUpdate = {
              ...pendingUpdate,
              suggestedCategoryId: prediction.label,
              suggestedDescription: relabel?.description ?? null,
              suggestedMerchantName: relabel?.merchantName ?? null,
              categoryConfidence: prediction.score.toFixed(2),
            };
            madeSuggestion = true;
            suggested += 1;
          }
        }
      }
    }

    const bootstrapSuggestion = bootstrapSuggestions.get(transaction.id);
    if (bootstrapSuggestion) {
      pendingUpdate = {
        ...pendingUpdate,
        suggestedCategoryId: bootstrapSuggestion.categoryId,
        categoryConfidence: bootstrapSuggestion.confidence.toFixed(2),
        metadata: {
          ...(pendingUpdate.metadata ?? transaction.metadata ?? {}),
          classificationBootstrap: {
            source: bootstrapSuggestion.source,
            reason: bootstrapSuggestion.reason,
            confidence: bootstrapSuggestion.confidence,
            suggestedAt: new Date().toISOString(),
          },
        },
      };
      madeSuggestion = true;
      suggested += 1;
      bootstrapSuggested += 1;
    }

    const shouldPersist =
      appliedCategory ||
      madeSuggestion ||
      Object.keys(identityUpdates).length > 0;

    if (shouldPersist) {
      pendingUpdate.updatedAt = new Date();
      await persistCategorizeUpdate(transaction.id, pendingUpdate);
      if (appliedCategory) {
        updated += 1;
      }
    }
  }

  return {
    updated,
    tier1,
    tier2,
    suggested,
    bootstrapSuggested,
    scanned: rows.length,
    lastScannedId,
    hasMore: rows.length >= PAGE_SIZE,
  };
}
