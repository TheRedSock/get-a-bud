import {
  bigint,
  boolean,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { households } from "./households";
import { categories } from "./categories";
import { transactions } from "./transactions";

// ---------- Enums ----------

export const billCadenceEnum = pgEnum("bill_cadence", [
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "semi_annual",
  "yearly",
  "unknown",
]);

// ---------- Recurring Bills ----------

export const recurringBills = pgTable(
  "recurring_bills",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    categoryId: text("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    suggestedCategoryId: text("suggested_category_id").references(
      () => categories.id,
      { onDelete: "set null" },
    ),
    name: text("name").notNull(),
    merchantPattern: text("merchant_pattern").notNull(),
    amountSignature: text("amount_signature").notNull().default(""),
    cadence: billCadenceEnum("cadence").notNull().default("monthly"),
    expectedAmountCents: bigint("expected_amount_cents", { mode: "number" }),
    nextDueDate: date("next_due_date"),
    lastAmountCents: bigint("last_amount_cents", { mode: "number" }),
    priceIncreaseThresholdPct: integer("price_increase_threshold_pct")
      .notNull()
      .default(15),
    isActive: boolean("is_active").notNull().default(true),
    isPossiblyCancelled: boolean("is_possibly_cancelled")
      .notNull()
      .default(false),
    isDuplicateSubscription: boolean("is_duplicate_subscription")
      .notNull()
      .default(false),
    detectedCadenceConfidence: numeric("detected_cadence_confidence", {
      precision: 3,
      scale: 2,
    }),
    pattern: text("pattern").default("day_of_month"),
    typicalDayOfMonth: integer("typical_day_of_month"),
    originalCurrency: text("original_currency"),
    lastOriginalAmountCents: bigint("last_original_amount_cents", {
      mode: "number",
    }),
    amountTrend: text("amount_trend").default("stable"),
    lastDetectedAt: timestamp("last_detected_at", { mode: "date" }),
    transactionCount: integer("transaction_count").default(0),
    userEndedAt: timestamp("user_ended_at", { mode: "date" }),
    autoEndedAt: timestamp("auto_ended_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("recurring_bills_household_idx").on(table.householdId),
    uniqueIndex("recurring_bills_household_merchant_sig_uidx").on(
      table.householdId,
      table.merchantPattern,
      table.amountSignature,
    ),
  ],
);

// ---------- Recurring Bill History ----------

export const recurringBillHistory = pgTable(
  "recurring_bill_history",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    billId: text("bill_id")
      .notNull()
      .references(() => recurringBills.id, { onDelete: "cascade" }),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    originalAmountCents: bigint("original_amount_cents", { mode: "number" }),
    originalCurrency: text("original_currency"),
    date: date("date").notNull(),
    transactionId: text("transaction_id").references(() => transactions.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("recurring_bill_history_bill_idx").on(table.billId),
    index("recurring_bill_history_bill_date_idx").on(table.billId, table.date),
    uniqueIndex("recurring_bill_history_bill_txn_uidx").on(
      table.billId,
      table.transactionId,
    ),
  ],
);
