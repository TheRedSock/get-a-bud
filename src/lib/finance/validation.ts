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

export const accountKindSchema = z.enum([
  "checking",
  "savings",
  "credit_card",
  "cash",
  "investment",
  "loan",
  "mortgage",
  "property",
  "other",
]);

export const createAccountSchema = z.object({
  name: z.string().min(1).max(120),
  kind: accountKindSchema.default("checking"),
  currency: currencySchema.default("NOK"),
  currentBalanceCents: centsField.default(0),
  institutionName: z.string().max(120).optional(),
});

export const updateAccountSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  kind: accountKindSchema.optional(),
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

/** Client form: empty category select maps to undefined before shared schema rules. */
export const createTransactionFormSchema = createTransactionSchema.extend({
  categoryId: z
    .union([z.string().min(1), z.literal("")])
    .optional()
    .transform((value) => (value === "" ? undefined : value)),
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

const createAssetFormSchema = createAssetSchema.extend({
  itemType: z.literal("asset"),
});

const createLiabilityFormSchema = createLiabilitySchema.extend({
  itemType: z.literal("liability"),
});

export const createNetWorthItemFormSchema = z.discriminatedUnion("itemType", [
  createAssetFormSchema,
  createLiabilityFormSchema,
]);

/** Account metadata editor (client). */
export const accountEditorFormSchema = z.object({
  name: z.string().min(1).max(120),
  kind: accountKindSchema,
  institutionName: z.string().max(120).optional(),
});

export const billCadenceSchema = z.enum([
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "semi_annual",
  "yearly",
  "unknown",
]);

export const createBillSchema = z.object({
  name: z.string().min(1).max(120),
  merchantPattern: z.string().min(1).max(160),
  cadence: billCadenceSchema.default("monthly"),
  categoryId: z.string().min(1),
  expectedAmountCents: z.preprocess(moneyPreprocessor, z.number().int().optional()),
  nextDueDate: z.string().min(8).optional(),
});

export const updateBillSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  cadence: billCadenceSchema.optional(),
  expectedAmountCents: z.preprocess(
    moneyPreprocessor,
    z.number().int().nonnegative().nullable().optional(),
  ),
  nextDueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  isActive: z.boolean().optional(),
  isPossiblyCancelled: z.boolean().optional(),
});

/** Recurring bill inline editor (client). */
export const updateBillFormSchema = z.object({
  name: z.string().trim().min(1).max(120),
  cadence: billCadenceSchema,
  expectedAmountCents: z.string().optional(),
  nextDueDate: z.string().optional(),
  isActive: z.boolean(),
  isPossiblyCancelled: z.boolean(),
});

/** Transaction row editor (client strings); map to updateTransactionSchema on submit. */
export const transactionEditorFormSchema = z.object({
  description: z.string().min(1).max(300),
  merchantName: z.string().max(160).optional(),
  notes: z.string().max(1000).optional(),
  categoryId: z
    .union([z.string().min(1), z.literal("")])
    .optional()
    .transform((value) => (value === "" ? null : value ?? null)),
  status: z.enum(["pending", "posted", "excluded"]),
  excludedFromBudget: z.coerce.boolean(),
  amountCents: z.string().optional(),
  date: z.string().min(8).optional(),
});

/** Build server update payload from editor form values. */
export function toUpdateTransactionPayload(
  values: z.infer<typeof transactionEditorFormSchema>,
  options: { includeAmount: boolean; includeDate: boolean },
): z.infer<typeof updateTransactionSchema> {
  return updateTransactionSchema.parse({
    description: values.description,
    merchantName: values.merchantName?.trim() || null,
    notes: values.notes?.trim() || null,
    categoryId: values.categoryId,
    status: values.status,
    excludedFromBudget: values.excludedFromBudget,
    ...(options.includeAmount && values.amountCents
      ? { amountCents: values.amountCents }
      : {}),
    ...(options.includeDate && values.date ? { date: values.date } : {}),
  });
}
