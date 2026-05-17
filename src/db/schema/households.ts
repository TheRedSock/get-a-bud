import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { users } from "./auth";

// ---------- Enums ----------

export const membershipRoleEnum = pgEnum("membership_role", [
  "owner",
  "admin",
  "member",
  "viewer",
]);

// ---------- Households ----------

export const households = pgTable("households", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  defaultCurrency: text("default_currency").notNull().default("NOK"),
  theme: text("theme").notNull().default("aurora"),
  createdById: text("created_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  classificationCorrectionsSinceTrain: integer(
    "classification_corrections_since_train",
  )
    .notNull()
    .default(0),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

// ---------- Memberships ----------

export const memberships = pgTable(
  "memberships",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: membershipRoleEnum("role").notNull().default("owner"),
    canViewNetWorth: boolean("can_view_net_worth").notNull().default(true),
    canManageIntegrations: boolean("can_manage_integrations")
      .notNull()
      .default(true),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("memberships_household_user_uidx").on(
      table.householdId,
      table.userId,
    ),
  ],
);
