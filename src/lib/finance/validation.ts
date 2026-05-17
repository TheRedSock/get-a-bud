import { z } from "zod";

import { moneyPreprocessor } from "@/lib/finance/money";

export const currencySchema = z.string().trim().toUpperCase().length(3);

/**
 * Zod schema for a money field that accepts user input (string or number)
 * and outputs integer cents. Uses the canonical money parser.
 */
const centsField = z.preprocess(moneyPreprocessor, z.number().int());
const centsFieldNonNegative = z.preprocess(
  moneyPreprocessor,
  z.number().int().nonnegative(),
);
const centsFieldOptional = z.preprocess(
  moneyPreprocessor,
  z.number().int().optional(),
);

export const createAccountSchema = z.object({
  name: z.string().min(1).max(120),
  kind: z
    .enum([
      "checking",
      "savings",
      "credit_card",
      "cash",
      "investment",
      "loan",
      "mortgage",
      "property",
      "other",
    ])
    .default("checking"),
  currency: currencySchema.default("NOK"),
  currentBalanceCents: centsField.default(0),
  institutionName: z.string().max(120).optional(),
});

export const updateAccountSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  kind: z
    .enum([
      "checking",
      "savings",
      "credit_card",
      "cash",
      "investment",
      "loan",
      "mortgage",
      "property",
      "other",
    ])
    .optional(),
  institutionName: z.string().max(120).nullable().optional(),
  isArchived: z.coerce.boolean().optional(),
});

export const createTransactionSchema = z.object({
  accountId: z.string().min(1),
  categoryId: z.string().min(1).optional(),
  amountCents: centsField,
  currency: currencySchema.default("NOK"),
  date: z.string().min(8),
  merchantName: z.string().max(160).optional(),
  description: z.string().min(1).max(300),
  notes: z.string().max(1000).optional(),
});

export const updateTransactionSchema = z.object({
  accountId: z.string().min(1).optional(),
  categoryId: z.string().min(1).nullable().optional(),
  amountCents: centsFieldOptional,
  currency: currencySchema.optional(),
  date: z.string().min(8).optional(),
  merchantName: z.string().max(160).nullable().optional(),
  description: z.string().min(1).max(300).optional(),
  notes: z.string().max(1000).nullable().optional(),
  status: z.enum(["pending", "posted", "excluded"]).optional(),
  excludedFromBudget: z.coerce.boolean().optional(),
});

export const createCategorySchema = z.object({
  name: z.string().min(1).max(80),
  color: z.string().default("var(--chart-1)"),
  icon: z.string().default("circle"),
  isIncome: z.coerce.boolean().default(false),
  groupId: z.string().min(1).optional(),
  parentId: z.string().min(1).optional(),
});

export const createBudgetSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(["monthly", "weekly", "zero_based", "envelope"]),
  currency: currencySchema.default("NOK"),
  periodStartDay: z.coerce.number().int().min(1).max(31).default(1),
  paycheckAnchorDay: z.coerce.number().int().min(1).max(31).optional(),
});

export const createAssetSchema = z.object({
  name: z.string().min(1).max(120),
  kind: z.string().min(1).max(80).default("property"),
  currency: currencySchema.default("NOK"),
  estimatedValueCents: centsFieldNonNegative,
  valuationDate: z.string().min(8),
  notes: z.string().max(1000).optional(),
});

export const createLiabilitySchema = z.object({
  name: z.string().min(1).max(120),
  kind: z.string().min(1).max(80).default("loan"),
  currency: currencySchema.default("NOK"),
  currentBalanceCents: centsFieldNonNegative,
  interestRate: z.coerce.number().optional(),
  minimumPaymentCents: centsFieldOptional,
  dueDay: z.coerce.number().int().min(1).max(31).optional(),
  notes: z.string().max(1000).optional(),
});
