import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { households } from "./households";

// ---------- Category Groups ----------

export const categoryGroups = pgTable(
  "category_groups",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("category_groups_household_key_uidx").on(
      table.householdId,
      table.key,
    ),
    index("category_groups_household_idx").on(table.householdId),
  ],
);

// ---------- Categories ----------

export const categories = pgTable(
  "categories",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    parentId: text("parent_id").references((): AnyPgColumn => categories.id),
    groupId: text("group_id")
      .notNull()
      .references(() => categoryGroups.id),
    name: text("name").notNull(),
    color: text("color").notNull().default("var(--chart-1)"),
    icon: text("icon").notNull().default("circle"),
    isIncome: boolean("is_income").notNull().default(false),
    isSystem: boolean("is_system").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("categories_household_toplevel_name_uidx")
      .on(table.householdId, table.name)
      .where(sql`${table.parentId} IS NULL`),
    uniqueIndex("categories_household_parent_name_uidx")
      .on(table.householdId, table.parentId, table.name)
      .where(sql`${table.parentId} IS NOT NULL`),
    index("categories_household_idx").on(table.householdId),
  ],
);

// ---------- Merchants ----------

export const merchants = pgTable(
  "merchants",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    canonicalName: text("canonical_name").notNull(),
    normalizedCanonicalName: text("normalized_canonical_name").notNull(),
    defaultCategoryId: text("default_category_id").references(
      () => categories.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("merchants_household_idx").on(table.householdId),
    index("merchants_household_normalized_idx").on(
      table.householdId,
      table.normalizedCanonicalName,
    ),
  ],
);

// ---------- Merchant Aliases ----------

export const merchantAliases = pgTable(
  "merchant_aliases",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
    normalizedAlias: text("normalized_alias").notNull(),
    source: text("source").notNull().default("unknown"),
    transactionType: text("transaction_type"),
    paymentChannel: text("payment_channel"),
    confidence: numeric("confidence", { precision: 3, scale: 2 })
      .notNull()
      .default("1.0"),
    matchType: text("match_type").notNull().default("user"),
    sampleTransactionId: text("sample_transaction_id"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("merchant_aliases_household_alias_uidx").on(
      table.householdId,
      table.normalizedAlias,
    ),
    index("merchant_aliases_household_idx").on(table.householdId),
    index("merchant_aliases_merchant_idx").on(table.merchantId),
    index("merchant_aliases_normalized_trgm_idx").using(
      "gin",
      sql`${table.normalizedAlias} gin_trgm_ops`,
    ),
  ],
);
