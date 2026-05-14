import { and, eq, inArray, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import {
  categories,
  recurringBillHistory,
  recurringBills,
} from "@/db/schema";
import { defaultMerchantRules } from "@/lib/finance/defaults";
import { normalizeMerchant } from "@/lib/finance/categorization";

export type BootstrapTransaction = {
  id: string;
  householdId: string;
  source: string;
  description: string;
  merchantName: string | null;
  normalizedMerchantName: string | null;
  transactionType: string | null;
  paymentChannel: string | null;
  metadata?: Record<string, unknown> | null;
};

export type BootstrapSuggestion = {
  categoryId: string;
  confidence: number;
  source: "bootstrap_rule" | "recurring_bill";
  reason: string;
};

type CategoryLookup = Map<string, string>;

type BootstrapRule = {
  id: string;
  categoryName: string;
  matchField: "merchant" | "description" | "counterparty";
  matcher: string;
  matcherType: "contains" | "exact" | "prefix";
  confidence: number;
  source?: string;
  importFormat?: string;
};

type TransactionMetadata = Record<string, unknown> & {
  parsed?: {
    counterparty?: string | null;
  } | null;
  import?: {
    format?: string | null;
  } | null;
};

const defaultRuleBoostrapRules: BootstrapRule[] = defaultMerchantRules.map(
  (rule) => ({
    id: `default-${rule.category}-${rule.matchField}-${rule.matcher}`,
    categoryName: rule.category,
    matchField: rule.matchField,
    matcher: rule.matcher,
    matcherType: rule.matcherType,
    confidence: 0.58,
  }),
);

const sourceSpecificRules: BootstrapRule[] = [
  {
    id: "enable-banking-salary-description",
    categoryName: "Salary",
    matchField: "description",
    matcher: "lønn",
    matcherType: "contains",
    confidence: 0.62,
    source: "enable_banking",
  },
  {
    id: "enable-banking-interest-fee",
    categoryName: "Fees & Charges",
    matchField: "description",
    matcher: "gebyr",
    matcherType: "contains",
    confidence: 0.6,
    source: "enable_banking",
  },
  {
    id: "dnb-credit-card-subscription-apple",
    categoryName: "Subscriptions",
    matchField: "merchant",
    matcher: "apple com bill",
    matcherType: "contains",
    confidence: 0.62,
    importFormat: "dnb_credit_card_period_export",
  },
];

const transactionTypeRules: BootstrapRule[] = [
  {
    id: "type-internal-transfer",
    categoryName: "Transfers",
    matchField: "description",
    matcher: "",
    matcherType: "contains",
    confidence: 0.72,
  },
  {
    id: "type-investment",
    categoryName: "Investments",
    matchField: "description",
    matcher: "",
    matcherType: "contains",
    confidence: 0.68,
  },
];

function metadataFor(transaction: BootstrapTransaction): TransactionMetadata {
  return (transaction.metadata ?? {}) as TransactionMetadata;
}

function importFormat(transaction: BootstrapTransaction): string | null {
  return metadataFor(transaction).import?.format ?? null;
}

function ruleAppliesToSource(
  rule: BootstrapRule,
  transaction: BootstrapTransaction,
) {
  if (rule.source && rule.source !== transaction.source) return false;
  if (rule.importFormat && rule.importFormat !== importFormat(transaction)) {
    return false;
  }
  return true;
}

function targetsFor(transaction: BootstrapTransaction) {
  const metadata = metadataFor(transaction);

  return {
    merchant: normalizeMerchant(
      transaction.normalizedMerchantName ??
        transaction.merchantName ??
        "",
    ),
    description: normalizeMerchant(transaction.description),
    counterparty: normalizeMerchant(metadata.parsed?.counterparty ?? ""),
  };
}

function matchesRule(
  rule: BootstrapRule,
  transaction: BootstrapTransaction,
) {
  if (!ruleAppliesToSource(rule, transaction)) return false;

  const target = targetsFor(transaction)[rule.matchField];
  const matcher = normalizeMerchant(rule.matcher);
  if (!target || !matcher) return false;

  switch (rule.matcherType) {
    case "exact":
      return target === matcher;
    case "prefix":
      return target.startsWith(matcher);
    case "contains":
    default:
      return target.includes(matcher);
  }
}

function typeSuggestion(
  transaction: BootstrapTransaction,
  categoryLookup: CategoryLookup,
): BootstrapSuggestion | null {
  const typeRule =
    transaction.transactionType === "internal_transfer"
      ? transactionTypeRules[0]
      : transaction.transactionType === "investment"
        ? transactionTypeRules[1]
        : null;
  if (!typeRule) return null;

  const categoryId = categoryLookup.get(typeRule.categoryName);
  if (!categoryId) return null;

  return {
    categoryId,
    confidence: typeRule.confidence,
    source: "bootstrap_rule",
    reason: typeRule.id,
  };
}

export function suggestFromBootstrapRules(
  transaction: BootstrapTransaction,
  categoryLookup: CategoryLookup,
): BootstrapSuggestion | null {
  const byType = typeSuggestion(transaction, categoryLookup);
  if (byType) return byType;

  const rules = [...sourceSpecificRules, ...defaultRuleBoostrapRules];
  for (const rule of rules) {
    if (!matchesRule(rule, transaction)) continue;

    const categoryId = categoryLookup.get(rule.categoryName);
    if (!categoryId) continue;

    return {
      categoryId,
      confidence: rule.confidence,
      source: "bootstrap_rule",
      reason: rule.id,
    };
  }

  return null;
}

export async function getBootstrapSuggestions(input: {
  householdId: string;
  transactions: BootstrapTransaction[];
}): Promise<Map<string, BootstrapSuggestion>> {
  const suggestions = new Map<string, BootstrapSuggestion>();
  if (input.transactions.length === 0) return suggestions;

  const [categoryRows, recurringRows] = await Promise.all([
    db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(eq(categories.householdId, input.householdId)),
    db
      .select({
        transactionId: recurringBillHistory.transactionId,
        categoryId: recurringBills.categoryId,
        billName: recurringBills.name,
      })
      .from(recurringBillHistory)
      .innerJoin(
        recurringBills,
        eq(recurringBills.id, recurringBillHistory.billId),
      )
      .where(
        and(
          eq(recurringBills.householdId, input.householdId),
          isNotNull(recurringBills.categoryId),
          inArray(
            recurringBillHistory.transactionId,
            input.transactions.map((transaction) => transaction.id),
          ),
        ),
      ),
  ]);

  const categoryLookup = new Map(
    categoryRows.map((category) => [category.name, category.id]),
  );

  for (const row of recurringRows) {
    if (!row.transactionId || !row.categoryId) continue;
    suggestions.set(row.transactionId, {
      categoryId: row.categoryId,
      confidence: 0.74,
      source: "recurring_bill",
      reason: `Recurring bill: ${row.billName}`,
    });
  }

  for (const transaction of input.transactions) {
    if (suggestions.has(transaction.id)) continue;

    const suggestion = suggestFromBootstrapRules(transaction, categoryLookup);
    if (suggestion) {
      suggestions.set(transaction.id, suggestion);
    }
  }

  return suggestions;
}
