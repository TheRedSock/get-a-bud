import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { households } from "./households";

// ---------- Classification Models ----------

export const classificationModels = pgTable(
  "classification_models",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    modelType: text("model_type").notNull().default("naive_bayes"),
    modelData: jsonb("model_data").$type<unknown[]>(),
    version: integer("version").notNull(),
    trainedAt: timestamp("trained_at", { mode: "date" }).notNull().defaultNow(),
    trainingTransactionCount: integer("training_transaction_count")
      .notNull()
      .default(0),
    accuracy: numeric("accuracy", { precision: 4, scale: 3 }),
    autoApplyThreshold: numeric("auto_apply_threshold", {
      precision: 3,
      scale: 2,
    }),
    suggestThreshold: numeric("suggest_threshold", {
      precision: 3,
      scale: 2,
    }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("classification_models_household_idx").on(table.householdId),
    uniqueIndex("classification_models_household_version_uidx").on(
      table.householdId,
      table.version,
    ),
  ],
);
