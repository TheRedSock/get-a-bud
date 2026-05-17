import {
  bigint,
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { households } from "./households";

// ---------- Enums ----------

export const accountKindEnum = pgEnum("financial_account_kind", [
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

// ---------- Financial Accounts ----------

export const financialAccounts = pgTable(
  "financial_accounts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: accountKindEnum("kind").notNull().default("checking"),
    currency: text("currency").notNull().default("NOK"),
    institutionName: text("institution_name"),
    mask: text("mask"),
    currentBalanceCents: bigint("current_balance_cents", { mode: "number" })
      .notNull()
      .default(0),
    availableBalanceCents: bigint("available_balance_cents", {
      mode: "number",
    }),
    creditLimitCents: bigint("credit_limit_cents", { mode: "number" }),
    isManual: boolean("is_manual").notNull().default(true),
    isArchived: boolean("is_archived").notNull().default(false),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("financial_accounts_household_idx").on(table.householdId),
    index("financial_accounts_kind_idx").on(table.kind),
  ],
);
