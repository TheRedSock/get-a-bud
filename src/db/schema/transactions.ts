import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { households } from "./households";
import { financialAccounts } from "./accounts";
import { categories, merchants } from "./categories";

// ---------- Enums ----------

export const transactionSourceEnum = pgEnum("transaction_source", [
  "manual",
  "enable_banking",
  "import",
]);

export const transactionStatusEnum = pgEnum("transaction_status", [
  "pending",
  "posted",
  "excluded",
]);

// ---------- Transactions ----------

export const transactions = pgTable(
  "transactions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => financialAccounts.id, { onDelete: "cascade" }),
    merchantId: text("merchant_id").references(() => merchants.id, {
      onDelete: "set null",
    }),
    categoryId: text("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    source: transactionSourceEnum("source").notNull().default("manual"),
    sourceTransactionId: text("source_transaction_id"),
    status: transactionStatusEnum("status").notNull().default("posted"),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("NOK"),
    originalAmountCents: bigint("original_amount_cents", { mode: "number" }),
    originalCurrency: text("original_currency"),
    date: date("date").notNull(),
    bookedAt: timestamp("booked_at", { mode: "date" }),
    merchantName: text("merchant_name"),
    normalizedMerchantName: text("normalized_merchant_name"),
    description: text("description").notNull(),
    notes: text("notes"),
    searchText: text("search_text").notNull().default(""),
    isRecurringCandidate: boolean("is_recurring_candidate")
      .notNull()
      .default(false),
    excludedFromBudget: boolean("excluded_from_budget")
      .notNull()
      .default(false),
    transactionType: text("transaction_type"),
    paymentChannel: text("payment_channel"),
    parserSource: text("parser_source"),
    categorySource: text("category_source"),
    categoryConfidence: numeric("category_confidence", {
      precision: 3,
      scale: 2,
    }),
    suggestedCategoryId: text("suggested_category_id").references(
      () => categories.id,
      { onDelete: "set null" },
    ),
    suggestedDescription: text("suggested_description"),
    suggestedMerchantName: text("suggested_merchant_name"),
    linkedTransactionId: text("linked_transaction_id").references(
      (): AnyPgColumn => transactions.id,
      { onDelete: "set null" },
    ),
    transferGroupId: text("transfer_group_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("transactions_household_date_idx").on(table.householdId, table.date),
    index("transactions_household_updated_id_idx").on(
      table.householdId,
      table.updatedAt,
      table.id,
    ),
    index("transactions_account_idx").on(table.accountId),
    index("transactions_merchant_idx").on(table.merchantId),
    index("transactions_category_idx").on(table.categoryId),
    index("transactions_search_trgm_idx").using(
      "gin",
      sql`${table.searchText} gin_trgm_ops`,
    ),
    uniqueIndex("transactions_source_uidx").on(
      table.source,
      table.sourceTransactionId,
      table.accountId,
    ),
    index("transactions_transfer_group_idx").on(table.transferGroupId),
  ],
);

// ---------- Categorization Rules ----------

export const categorizationRules = pgTable(
  "categorization_rules",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    matcher: text("matcher").notNull(),
    matcherType: text("matcher_type").notNull().default("contains"),
    matchField: text("match_field").notNull().default("merchant"),
    priority: integer("priority").notNull().default(100),
    learnedFromTransactionId: text("learned_from_transaction_id"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("categorization_rules_household_idx").on(table.householdId),
    uniqueIndex("categorization_rules_household_field_matcher_uidx").on(
      table.householdId,
      table.matchField,
      table.matcher,
    ),
  ],
);

// ---------- Transaction Links ----------

export const transactionLinks = pgTable(
  "transaction_links",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    groupId: text("group_id").notNull(),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("source"),
    confidence: numeric("confidence", { precision: 3, scale: 2 })
      .notNull()
      .default("1.0"),
    confirmed: boolean("confirmed").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("transaction_links_group_txn_uidx").on(
      table.groupId,
      table.transactionId,
    ),
    index("transaction_links_household_idx").on(table.householdId),
    index("transaction_links_transaction_idx").on(table.transactionId),
    index("transaction_links_group_idx").on(table.groupId),
  ],
);
