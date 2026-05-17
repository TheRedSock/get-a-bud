import {
  bigint,
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { households } from "./households";
import { categories } from "./categories";

// ---------- Enums ----------

export const budgetTypeEnum = pgEnum("budget_type", [
  "monthly",
  "weekly",
  "zero_based",
  "envelope",
]);

// ---------- Budgets ----------

export const budgets = pgTable(
  "budgets",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: budgetTypeEnum("type").notNull().default("monthly"),
    currency: text("currency").notNull().default("NOK"),
    periodStartDay: integer("period_start_day").notNull().default(1),
    paycheckAnchorDay: integer("paycheck_anchor_day"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("budgets_household_idx").on(table.householdId)],
);

// ---------- Budget Lines ----------

export const budgetLines = pgTable(
  "budget_lines",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    budgetId: text("budget_id")
      .notNull()
      .references(() => budgets.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    allocatedAmountCents: bigint("allocated_amount_cents", {
      mode: "number",
    }).notNull(),
    rolloverEnabled: boolean("rollover_enabled").notNull().default(false),
    envelopeBalanceCents: bigint("envelope_balance_cents", {
      mode: "number",
    })
      .notNull()
      .default(0),
  },
  (table) => [
    uniqueIndex("budget_lines_budget_category_uidx").on(
      table.budgetId,
      table.categoryId,
    ),
  ],
);
