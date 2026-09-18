import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { categorizationRules } from "@/db/schema";
import type { CategoryDetectionResult, MatchField } from "@/lib/classification/types";

export function normalizeMerchant(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9æøå ]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Strip PayPal internal reference suffixes (e.g., ":P3", ":P4") from a raw
 * merchant name. These are rotating PayPal payment identifiers that do not
 * represent distinct merchants — "Spotify:P3" and "Spotify:P4" are the same
 * subscription.
 *
 * Applied before normalization so that the normalized merchant key stabilizes
 * across reference rotations.
 */
export function stripPaypalReferenceSuffix(raw: string): string {
  // Match trailing :P followed by 1+ digits, optionally preceded by whitespace
  return raw.replace(/\s*:P\d+$/i, "").trim();
}

/**
 * Enhanced category detection with field-scoped matching.
 *
 * Rules match against specific fields (merchant, description, counterparty)
 * instead of a concatenated string. This prevents short matchers from
 * over-matching across unrelated text.
 *
 * Returns null (not a fallback "Other" category) when no genuine rule matches,
 * so that Tier 2 has the opportunity to classify.
 */
export async function detectCategory(
  householdId: string,
  description: string,
  merchantName?: string | null,
  opts?: {
    normalizedMerchantName?: string | null;
    counterparty?: string | null;
  },
): Promise<CategoryDetectionResult | null> {
  const rules = await db
    .select({
      categoryId: categorizationRules.categoryId,
      matcher: categorizationRules.matcher,
      matcherType: categorizationRules.matcherType,
      matchField: categorizationRules.matchField,
      priority: categorizationRules.priority,
    })
    .from(categorizationRules)
    .where(eq(categorizationRules.householdId, householdId))
    .orderBy(desc(categorizationRules.priority));

  // Build normalized targets for each field
  const targets: Record<string, string> = {
    merchant: normalizeMerchant(
      opts?.normalizedMerchantName ?? merchantName ?? "",
    ),
    description: normalizeMerchant(description),
    counterparty: normalizeMerchant(opts?.counterparty ?? ""),
  };

  for (const rule of rules) {
    const normalizedMatcher = normalizeMerchant(rule.matcher);
    const field = (rule.matchField ?? "merchant") as string;
    const target = targets[field] ?? "";

    if (!target) continue;

    let matched = false;
    switch (rule.matcherType) {
      case "exact":
        matched = target === normalizedMatcher;
        break;
      case "prefix":
        matched = target.startsWith(normalizedMatcher);
        break;
      case "contains":
      default:
        matched = target.includes(normalizedMatcher);
        break;
    }

    if (matched) {
      const confidence = rule.priority >= 500 ? 0.9 : 0.8;
      return {
        categoryId: rule.categoryId,
        confidence,
        source: "rule",
      };
    }
  }

  // No match — return null so Tier 2 can attempt classification
  return null;
}

/**
 * Determine matcher type based on specificity of the matcher string.
 */
function selectMatcherType(
  normalized: string,
  words: string[],
): "exact" | "contains" | "prefix" {
  // Very short matchers (< 5 chars total) → exact match only
  if (normalized.length < 5) return "exact";

  // Single short word (< 6 chars) → contains is safe when scoped to
  // normalizedMerchantName (the field is already specific)
  if (words.length === 1 && words[0].length < 6) return "contains";

  // Multi-word or long single word → contains
  return "contains";
}

/**
 * Learn a category correction from a user edit. Upserts to prevent duplicates.
 *
 * When a user changes a transaction's category, this creates or updates a
 * categorization rule so that future transactions with the same merchant
 * are automatically categorized correctly.
 */
export async function learnCategoryCorrection(input: {
  householdId: string;
  categoryId: string;
  matcher: string;
  matchField?: MatchField;
  transactionId?: string;
}) {
  const normalized = normalizeMerchant(input.matcher);
  if (normalized.length < 2) return;

  const words = normalized.split(" ").filter((w) => w.length > 0);
  const matcherType = selectMatcherType(normalized, words);
  const matchField = input.matchField ?? "merchant";

  await db
    .insert(categorizationRules)
    .values({
      householdId: input.householdId,
      categoryId: input.categoryId,
      matcher: normalized,
      matcherType,
      matchField,
      priority: 500,
      learnedFromTransactionId: input.transactionId,
    })
    .onConflictDoUpdate({
      target: [
        categorizationRules.householdId,
        categorizationRules.matchField,
        categorizationRules.matcher,
      ],
      set: {
        categoryId: input.categoryId,
        matcherType,
        matchField,
        priority: 500,
        learnedFromTransactionId: input.transactionId,
      },
    });
}
