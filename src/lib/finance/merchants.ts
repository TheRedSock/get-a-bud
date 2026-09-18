import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { merchantAliases, merchants } from "@/db/schema";
import { normalizeMerchant } from "@/lib/finance/categorization";

type TransactionMetadata = Record<string, unknown> & {
  observedMerchantName?: string | null;
  providerMerchantName?: string | null;
  parsed?: {
    merchantName?: string | null;
    counterparty?: string | null;
  } | null;
  userEdits?: {
    originalMerchantName?: string | null;
  };
};

export type MerchantTransactionInput = {
  id?: string;
  householdId?: string;
  source?: string | null;
  description: string;
  merchantName?: string | null;
  normalizedMerchantName?: string | null;
  transactionType?: string | null;
  paymentChannel?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type CategoryLearningTarget = {
  matcher: string;
  matchField: "merchant" | "description" | "counterparty";
};

export type MerchantResolutionResult = {
  merchantId: string;
  canonicalName: string;
  normalizedCanonicalName: string;
  defaultCategoryId: string | null;
  matchType: "exact_alias" | "fuzzy_alias";
  confidence: number;
  alias: string;
  normalizedAlias: string;
};

const FUZZY_AUTO_MATCH_THRESHOLD = 0.82;

function asMetadata(
  metadata: Record<string, unknown> | null | undefined,
): TransactionMetadata {
  return (metadata ?? {}) as TransactionMetadata;
}

function cleanCandidate(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Returns the best source-observed merchant alias for matching future raw
 * transactions. This intentionally prefers original/parser/import values over
 * a user-edited display name.
 */
export function getSourceObservedMerchantName(
  transaction: MerchantTransactionInput,
): string | null {
  const metadata = asMetadata(transaction.metadata);

  return (
    cleanCandidate(metadata.userEdits?.originalMerchantName) ??
    cleanCandidate(metadata.observedMerchantName) ??
    cleanCandidate(metadata.providerMerchantName) ??
    cleanCandidate(metadata.parsed?.merchantName) ??
    cleanCandidate(transaction.merchantName) ??
    cleanCandidate(transaction.normalizedMerchantName)
  );
}

export function getCategoryLearningTarget(
  transaction: MerchantTransactionInput,
): CategoryLearningTarget | null {
  const metadata = asMetadata(transaction.metadata);
  const observedMerchant = getSourceObservedMerchantName(transaction);

  if (observedMerchant && normalizeMerchant(observedMerchant).length >= 3) {
    return { matcher: observedMerchant, matchField: "merchant" };
  }

  const counterparty = cleanCandidate(metadata.parsed?.counterparty);
  if (counterparty && normalizeMerchant(counterparty).length >= 3) {
    return { matcher: counterparty, matchField: "counterparty" };
  }

  const description = cleanCandidate(transaction.description);
  if (description && normalizeMerchant(description).length >= 3) {
    return { matcher: description, matchField: "description" };
  }

  return null;
}

export function tokenOverlapScore(left: string, right: string): number {
  const leftTokens = new Set(left.split(" ").filter((token) => token.length >= 2));
  const rightTokens = new Set(right.split(" ").filter((token) => token.length >= 2));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  // Character-length weighted scoring: longer tokens contribute more to the
  // score than short ones. This prevents short noise tokens (e.g., PayPal
  // reference codes like "p3" vs "p4") from disproportionately penalizing
  // what is clearly the same merchant based on the bulk of the text.
  let matchedChars = 0;
  for (const token of leftTokens) {
    if (
      rightTokens.has(token) ||
      [...rightTokens].some(
        (candidate) =>
          candidate.startsWith(token) || token.startsWith(candidate),
      )
    ) {
      matchedChars += token.length;
    }
  }

  const leftTotal = [...leftTokens].reduce((sum, t) => sum + t.length, 0);
  const rightTotal = [...rightTokens].reduce((sum, t) => sum + t.length, 0);

  return matchedChars / Math.max(leftTotal, rightTotal);
}

export function isHighConfidenceAliasMatch(input: {
  normalizedObserved: string;
  normalizedAlias: string;
  similarity: number;
}): boolean {
  if (input.normalizedObserved === input.normalizedAlias) return true;
  if (
    input.normalizedObserved.startsWith(input.normalizedAlias) ||
    input.normalizedAlias.startsWith(input.normalizedObserved)
  ) {
    return (
      input.similarity >= 0.7 &&
      input.normalizedObserved.length >= 5 &&
      input.normalizedAlias.length >= 5
    );
  }

  const overlap = tokenOverlapScore(
    input.normalizedObserved,
    input.normalizedAlias,
  );
  return (
    input.similarity >= FUZZY_AUTO_MATCH_THRESHOLD &&
    overlap >= 0.67 &&
    input.normalizedObserved.length >= 5 &&
    input.normalizedAlias.length >= 5
  );
}

export async function resolveMerchantIdentity(input: {
  householdId: string;
  transaction: MerchantTransactionInput;
}): Promise<MerchantResolutionResult | null> {
  const observedMerchant = getSourceObservedMerchantName(input.transaction);
  const normalizedObserved = observedMerchant
    ? normalizeMerchant(observedMerchant)
    : "";

  if (normalizedObserved.length < 3) return null;

  const exact = await db
    .select({
      merchantId: merchants.id,
      canonicalName: merchants.canonicalName,
      normalizedCanonicalName: merchants.normalizedCanonicalName,
      defaultCategoryId: merchants.defaultCategoryId,
      alias: merchantAliases.alias,
      normalizedAlias: merchantAliases.normalizedAlias,
    })
    .from(merchantAliases)
    .innerJoin(merchants, eq(merchantAliases.merchantId, merchants.id))
    .where(
      and(
        eq(merchantAliases.householdId, input.householdId),
        eq(merchantAliases.normalizedAlias, normalizedObserved),
      ),
    )
    .limit(1);

  if (exact[0]) {
    return {
      ...exact[0],
      matchType: "exact_alias",
      confidence: 1,
    };
  }

  const similarity = sql<number>`similarity(${merchantAliases.normalizedAlias}, ${normalizedObserved})`;
  const candidates = await db
    .select({
      merchantId: merchants.id,
      canonicalName: merchants.canonicalName,
      normalizedCanonicalName: merchants.normalizedCanonicalName,
      defaultCategoryId: merchants.defaultCategoryId,
      alias: merchantAliases.alias,
      normalizedAlias: merchantAliases.normalizedAlias,
      similarity,
    })
    .from(merchantAliases)
    .innerJoin(merchants, eq(merchantAliases.merchantId, merchants.id))
    .where(
      and(
        eq(merchantAliases.householdId, input.householdId),
        sql`${merchantAliases.normalizedAlias} % ${normalizedObserved}`,
      ),
    )
    .orderBy(desc(similarity))
    .limit(5);

  const match = candidates.find((candidate) =>
    isHighConfidenceAliasMatch({
      normalizedObserved,
      normalizedAlias: candidate.normalizedAlias,
      similarity: Number(candidate.similarity),
    }),
  );

  if (!match) return null;

  await db
    .insert(merchantAliases)
    .values({
      householdId: input.householdId,
      merchantId: match.merchantId,
      alias: observedMerchant!,
      normalizedAlias: normalizedObserved,
      source: input.transaction.source ?? "unknown",
      transactionType: input.transaction.transactionType ?? null,
      paymentChannel: input.transaction.paymentChannel ?? null,
      confidence: Number(match.similarity).toFixed(2),
      matchType: "fuzzy_alias",
      sampleTransactionId: input.transaction.id,
    })
    .onConflictDoNothing();

  return {
    merchantId: match.merchantId,
    canonicalName: match.canonicalName,
    normalizedCanonicalName: match.normalizedCanonicalName,
    defaultCategoryId: match.defaultCategoryId,
    matchType: "fuzzy_alias",
    confidence: Number(match.similarity),
    alias: observedMerchant!,
    normalizedAlias: normalizedObserved,
  };
}

export async function upsertMerchantFromUserCorrection(input: {
  householdId: string;
  categoryId: string;
  transaction: MerchantTransactionInput;
  displayMerchantName?: string | null;
}) {
  const observedMerchant = getSourceObservedMerchantName(input.transaction);
  const normalizedObserved = observedMerchant
    ? normalizeMerchant(observedMerchant)
    : "";
  if (normalizedObserved.length < 3) return null;

  const canonicalName =
    cleanCandidate(input.displayMerchantName) ??
    cleanCandidate(input.transaction.merchantName) ??
    observedMerchant!;
  const normalizedCanonicalName = normalizeMerchant(canonicalName);

  const existing = await resolveMerchantIdentity({
    householdId: input.householdId,
    transaction: input.transaction,
  });

  if (existing) {
    const [updatedMerchant] = await db
      .update(merchants)
      .set({
        canonicalName,
        normalizedCanonicalName,
        defaultCategoryId: input.categoryId,
        updatedAt: new Date(),
      })
      .where(eq(merchants.id, existing.merchantId))
      .returning();

    await db
      .insert(merchantAliases)
      .values({
        householdId: input.householdId,
        merchantId: existing.merchantId,
        alias: observedMerchant!,
        normalizedAlias: normalizedObserved,
        source: input.transaction.source ?? "unknown",
        transactionType: input.transaction.transactionType ?? null,
        paymentChannel: input.transaction.paymentChannel ?? null,
        confidence: "1.00",
        matchType: "user",
        sampleTransactionId: input.transaction.id,
      })
      .onConflictDoNothing();

    return updatedMerchant ?? null;
  }

  const [createdMerchant] = await db
    .insert(merchants)
    .values({
      householdId: input.householdId,
      canonicalName,
      normalizedCanonicalName,
      defaultCategoryId: input.categoryId,
    })
    .returning();

  if (!createdMerchant) return null;

  await db
    .insert(merchantAliases)
    .values({
      householdId: input.householdId,
      merchantId: createdMerchant.id,
      alias: observedMerchant!,
      normalizedAlias: normalizedObserved,
      source: input.transaction.source ?? "unknown",
      transactionType: input.transaction.transactionType ?? null,
      paymentChannel: input.transaction.paymentChannel ?? null,
      confidence: "1.00",
      matchType: "user",
      sampleTransactionId: input.transaction.id,
    })
    .onConflictDoUpdate({
      target: [
        merchantAliases.householdId,
        merchantAliases.normalizedAlias,
      ],
      set: {
        merchantId: createdMerchant.id,
        alias: observedMerchant!,
        source: input.transaction.source ?? "unknown",
        transactionType: input.transaction.transactionType ?? null,
        paymentChannel: input.transaction.paymentChannel ?? null,
        confidence: "1.00",
        matchType: "user",
        sampleTransactionId: input.transaction.id,
        updatedAt: new Date(),
      },
    });

  return createdMerchant;
}

export async function updateMerchantCanonicalName(input: {
  householdId: string;
  merchantId: string;
  canonicalName: string;
}) {
  const canonicalName = input.canonicalName.trim();
  if (!canonicalName) return null;

  const [updated] = await db
    .update(merchants)
    .set({
      canonicalName,
      normalizedCanonicalName: normalizeMerchant(canonicalName),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(merchants.id, input.merchantId),
        eq(merchants.householdId, input.householdId),
      ),
    )
    .returning();

  return updated ?? null;
}
