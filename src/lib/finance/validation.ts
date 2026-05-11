import { z } from "zod";

export const currencySchema = z.string().trim().toUpperCase().length(3);

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
  currentBalance: z.coerce.number().default(0),
  institutionName: z.string().max(120).optional(),
});

export const createTransactionSchema = z.object({
  accountId: z.string().min(1),
  categoryId: z.string().min(1).optional(),
  amount: z.coerce.number(),
  currency: currencySchema.default("NOK"),
  date: z.string().min(8),
  merchantName: z.string().max(160).optional(),
  description: z.string().min(1).max(300),
  notes: z.string().max(1000).optional(),
});

export const createCategorySchema = z.object({
  name: z.string().min(1).max(80),
  color: z.string().default("var(--chart-1)"),
  icon: z.string().default("circle"),
  isIncome: z.coerce.boolean().default(false),
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
  estimatedValue: z.coerce.number().nonnegative(),
  valuationDate: z.string().min(8),
  notes: z.string().max(1000).optional(),
});

export const createLiabilitySchema = z.object({
  name: z.string().min(1).max(120),
  kind: z.string().min(1).max(80).default("loan"),
  currency: currencySchema.default("NOK"),
  currentBalance: z.coerce.number().nonnegative(),
  interestRate: z.coerce.number().optional(),
  minimumPayment: z.coerce.number().optional(),
  dueDay: z.coerce.number().int().min(1).max(31).optional(),
  notes: z.string().max(1000).optional(),
});
