CREATE TABLE "category_groups" (
  "id" text PRIMARY KEY NOT NULL,
  "household_id" text NOT NULL,
  "key" text NOT NULL,
  "label" text NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "category_groups" ADD CONSTRAINT "category_groups_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "category_groups_household_key_uidx" ON "category_groups" USING btree ("household_id","key");
--> statement-breakpoint
CREATE INDEX "category_groups_household_idx" ON "category_groups" USING btree ("household_id");
--> statement-breakpoint
INSERT INTO "category_groups" ("id", "household_id", "key", "label", "sort_order")
SELECT 'legacy-' || "id", "id", 'legacy', 'Legacy', 0
FROM "households"
ON CONFLICT DO NOTHING;
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "group_id" text;
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE "categories"
SET "group_id" = 'legacy-' || "household_id"
WHERE "group_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "group_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_group_id_category_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."category_groups"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
DROP INDEX IF EXISTS "categories_household_name_uidx";
--> statement-breakpoint
CREATE UNIQUE INDEX "categories_household_toplevel_name_uidx" ON "categories" USING btree ("household_id","name") WHERE "parent_id" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "categories_household_parent_name_uidx" ON "categories" USING btree ("household_id","parent_id","name") WHERE "parent_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN "classification_corrections_since_train" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "categorization_rules" ADD COLUMN "match_field" text DEFAULT 'merchant' NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "categorization_rules_household_field_matcher_uidx" ON "categorization_rules" USING btree ("household_id","match_field","matcher");
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "transaction_type" text;
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "payment_channel" text;
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "parser_source" text;
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "category_source" text;
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "category_confidence" numeric(3, 2);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "suggested_category_id" text;
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "suggested_description" text;
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "suggested_merchant_name" text;
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "linked_transaction_id" text;
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "transfer_group_id" text;
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_suggested_category_id_categories_id_fk" FOREIGN KEY ("suggested_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_linked_transaction_id_transactions_id_fk" FOREIGN KEY ("linked_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "transactions_transfer_group_idx" ON "transactions" USING btree ("transfer_group_id");
--> statement-breakpoint
CREATE TABLE "transaction_links" (
  "id" text PRIMARY KEY NOT NULL,
  "household_id" text NOT NULL,
  "group_id" text NOT NULL,
  "transaction_id" text NOT NULL,
  "role" text DEFAULT 'source' NOT NULL,
  "confidence" numeric(3, 2) DEFAULT '1.0' NOT NULL,
  "confirmed" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transaction_links" ADD CONSTRAINT "transaction_links_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "transaction_links" ADD CONSTRAINT "transaction_links_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_links_group_txn_uidx" ON "transaction_links" USING btree ("group_id","transaction_id");
--> statement-breakpoint
CREATE INDEX "transaction_links_household_idx" ON "transaction_links" USING btree ("household_id");
--> statement-breakpoint
CREATE INDEX "transaction_links_transaction_idx" ON "transaction_links" USING btree ("transaction_id");
--> statement-breakpoint
CREATE INDEX "transaction_links_group_idx" ON "transaction_links" USING btree ("group_id");
--> statement-breakpoint
CREATE TABLE "classification_models" (
  "id" text PRIMARY KEY NOT NULL,
  "household_id" text NOT NULL,
  "model_type" text DEFAULT 'naive_bayes' NOT NULL,
  "model_data" jsonb,
  "version" integer NOT NULL,
  "trained_at" timestamp DEFAULT now() NOT NULL,
  "training_transaction_count" integer DEFAULT 0 NOT NULL,
  "accuracy" numeric(4, 3),
  "auto_apply_threshold" numeric(3, 2),
  "suggest_threshold" numeric(3, 2),
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "classification_models" ADD CONSTRAINT "classification_models_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "classification_models_household_idx" ON "classification_models" USING btree ("household_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "classification_models_household_version_uidx" ON "classification_models" USING btree ("household_id","version");
--> statement-breakpoint
ALTER TABLE "recurring_bills" ADD COLUMN "amount_signature" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "recurring_bills" ADD COLUMN "is_possibly_cancelled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "recurring_bills" ADD COLUMN "is_duplicate_subscription" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "recurring_bills" ADD COLUMN "detected_cadence_confidence" numeric(3, 2);
--> statement-breakpoint
ALTER TABLE "recurring_bills" ADD COLUMN "pattern" text DEFAULT 'day_of_month';
--> statement-breakpoint
ALTER TABLE "recurring_bills" ADD COLUMN "typical_day_of_month" integer;
--> statement-breakpoint
ALTER TABLE "recurring_bills" ADD COLUMN "original_currency" text;
--> statement-breakpoint
ALTER TABLE "recurring_bills" ADD COLUMN "last_original_amount" numeric(18, 2);
--> statement-breakpoint
ALTER TABLE "recurring_bills" ADD COLUMN "amount_trend" text DEFAULT 'stable';
--> statement-breakpoint
ALTER TABLE "recurring_bills" ADD COLUMN "last_detected_at" timestamp;
--> statement-breakpoint
ALTER TABLE "recurring_bills" ADD COLUMN "transaction_count" integer DEFAULT 0;
--> statement-breakpoint
DROP INDEX IF EXISTS "recurring_bills_household_merchant_uidx";
--> statement-breakpoint
CREATE UNIQUE INDEX "recurring_bills_household_merchant_sig_uidx" ON "recurring_bills" USING btree ("household_id","merchant_pattern","amount_signature");
--> statement-breakpoint
CREATE TABLE "recurring_bill_history" (
  "id" text PRIMARY KEY NOT NULL,
  "bill_id" text NOT NULL,
  "amount" numeric(18, 2) NOT NULL,
  "original_amount" numeric(18, 2),
  "original_currency" text,
  "date" date NOT NULL,
  "transaction_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recurring_bill_history" ADD CONSTRAINT "recurring_bill_history_bill_id_recurring_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."recurring_bills"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "recurring_bill_history" ADD CONSTRAINT "recurring_bill_history_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "recurring_bill_history_bill_idx" ON "recurring_bill_history" USING btree ("bill_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "recurring_bill_history_bill_txn_uidx" ON "recurring_bill_history" USING btree ("bill_id","transaction_id");
