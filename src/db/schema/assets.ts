import {
  bigint,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { households } from "./households";

// ---------- Assets ----------

export const assets = pgTable(
  "assets",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("property"),
    currency: text("currency").notNull().default("NOK"),
    estimatedValueCents: bigint("estimated_value_cents", {
      mode: "number",
    }).notNull(),
    valuationDate: date("valuation_date").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("assets_household_idx").on(table.householdId)],
);

// ---------- Liabilities ----------

export const liabilities = pgTable(
  "liabilities",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("loan"),
    currency: text("currency").notNull().default("NOK"),
    currentBalanceCents: bigint("current_balance_cents", {
      mode: "number",
    }).notNull(),
    interestRate: numeric("interest_rate", { precision: 8, scale: 4 }),
    minimumPaymentCents: bigint("minimum_payment_cents", { mode: "number" }),
    dueDay: integer("due_day"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("liabilities_household_idx").on(table.householdId)],
);
