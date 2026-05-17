CREATE TYPE "public"."financial_account_kind" AS ENUM('checking', 'savings', 'credit_card', 'cash', 'investment', 'loan', 'mortgage', 'property', 'other');--> statement-breakpoint
CREATE TYPE "public"."bill_cadence" AS ENUM('weekly', 'biweekly', 'monthly', 'quarterly', 'semi_annual', 'yearly', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."budget_type" AS ENUM('monthly', 'weekly', 'zero_based', 'envelope');--> statement-breakpoint
CREATE TYPE "public"."ingestion_provider" AS ENUM('enable_banking', 'manual', 'import');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('owner', 'admin', 'member', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'rate_limited');--> statement-breakpoint
CREATE TYPE "public"."transaction_source" AS ENUM('manual', 'enable_banking', 'import');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('pending', 'posted', 'excluded');--> statement-breakpoint
CREATE TABLE "assets" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'property' NOT NULL,
	"currency" text DEFAULT 'NOK' NOT NULL,
	"estimated_value_cents" bigint NOT NULL,
	"valuation_date" date NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"household_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"outcome" text NOT NULL,
	"request_id" text,
	"ip_hash" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "auth_accounts" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "auth_accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "budget_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"budget_id" text NOT NULL,
	"category_id" text NOT NULL,
	"allocated_amount_cents" bigint NOT NULL,
	"rollover_enabled" boolean DEFAULT false NOT NULL,
	"envelope_balance_cents" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"name" text NOT NULL,
	"type" "budget_type" DEFAULT 'monthly' NOT NULL,
	"currency" text DEFAULT 'NOK' NOT NULL,
	"period_start_day" integer DEFAULT 1 NOT NULL,
	"paycheck_anchor_day" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"parent_id" text,
	"group_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT 'var(--chart-1)' NOT NULL,
	"icon" text DEFAULT 'circle' NOT NULL,
	"is_income" boolean DEFAULT false NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categorization_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"category_id" text NOT NULL,
	"matcher" text NOT NULL,
	"matcher_type" text DEFAULT 'contains' NOT NULL,
	"match_field" text DEFAULT 'merchant' NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"learned_from_transaction_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
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
CREATE TABLE "exchange_rates" (
	"id" text PRIMARY KEY NOT NULL,
	"base_currency" text NOT NULL,
	"quote_currency" text NOT NULL,
	"rate" numeric(18, 8) NOT NULL,
	"as_of_date" date NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" "financial_account_kind" DEFAULT 'checking' NOT NULL,
	"currency" text DEFAULT 'NOK' NOT NULL,
	"institution_name" text,
	"mask" text,
	"current_balance_cents" bigint DEFAULT 0 NOT NULL,
	"available_balance_cents" bigint,
	"credit_limit_cents" bigint,
	"is_manual" boolean DEFAULT true NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"default_currency" text DEFAULT 'NOK' NOT NULL,
	"theme" text DEFAULT 'aurora' NOT NULL,
	"created_by_id" text,
	"classification_corrections_since_train" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"provider" "ingestion_provider" NOT NULL,
	"display_name" text NOT NULL,
	"external_application_id" text,
	"encrypted_private_key" text,
	"encrypted_private_key_iv" text,
	"encrypted_private_key_tag" text,
	"consent_session_id" text,
	"authorization_id" text,
	"authorization_state_hash" text,
	"authorization_state_expires_at" timestamp,
	"consent_expires_at" timestamp,
	"status" text DEFAULT 'needs_setup' NOT NULL,
	"last_synced_at" timestamp,
	"rate_limited_until" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "liabilities" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'loan' NOT NULL,
	"currency" text DEFAULT 'NOK' NOT NULL,
	"current_balance_cents" bigint NOT NULL,
	"interest_rate" numeric(8, 4),
	"minimum_payment_cents" bigint,
	"due_day" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "membership_role" DEFAULT 'owner' NOT NULL,
	"can_view_net_worth" boolean DEFAULT true NOT NULL,
	"can_manage_integrations" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_aliases" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"alias" text NOT NULL,
	"normalized_alias" text NOT NULL,
	"source" text DEFAULT 'unknown' NOT NULL,
	"transaction_type" text,
	"payment_channel" text,
	"confidence" numeric(3, 2) DEFAULT '1.0' NOT NULL,
	"match_type" text DEFAULT 'user' NOT NULL,
	"sample_transaction_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"canonical_name" text NOT NULL,
	"normalized_canonical_name" text NOT NULL,
	"default_category_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL,
	"financial_account_id" text,
	"provider_account_id" text NOT NULL,
	"provider_account_name" text,
	"currency" text DEFAULT 'NOK' NOT NULL,
	"last_balance_cents" bigint,
	"sync_cursor" text,
	"raw" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_bill_history" (
	"id" text PRIMARY KEY NOT NULL,
	"bill_id" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"original_amount_cents" bigint,
	"original_currency" text,
	"date" date NOT NULL,
	"transaction_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_bills" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"category_id" text,
	"name" text NOT NULL,
	"merchant_pattern" text NOT NULL,
	"amount_signature" text DEFAULT '' NOT NULL,
	"cadence" "bill_cadence" DEFAULT 'monthly' NOT NULL,
	"expected_amount_cents" bigint,
	"next_due_date" date,
	"last_amount_cents" bigint,
	"price_increase_threshold_pct" integer DEFAULT 15 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_possibly_cancelled" boolean DEFAULT false NOT NULL,
	"is_duplicate_subscription" boolean DEFAULT false NOT NULL,
	"detected_cadence_confidence" numeric(3, 2),
	"pattern" text DEFAULT 'day_of_month',
	"typical_day_of_month" integer,
	"original_currency" text,
	"last_original_amount_cents" bigint,
	"amount_trend" text DEFAULT 'stable',
	"last_detected_at" timestamp,
	"transaction_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" text,
	"provider" "ingestion_provider" NOT NULL,
	"status" "sync_status" DEFAULT 'queued' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"imported_accounts" integer DEFAULT 0 NOT NULL,
	"imported_transactions" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"error_message" text,
	"metadata" jsonb
);
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
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"account_id" text NOT NULL,
	"merchant_id" text,
	"category_id" text,
	"source" "transaction_source" DEFAULT 'manual' NOT NULL,
	"source_transaction_id" text,
	"status" "transaction_status" DEFAULT 'posted' NOT NULL,
	"amount_cents" bigint NOT NULL,
	"currency" text DEFAULT 'NOK' NOT NULL,
	"original_amount_cents" bigint,
	"original_currency" text,
	"date" date NOT NULL,
	"booked_at" timestamp,
	"merchant_name" text,
	"normalized_merchant_name" text,
	"description" text NOT NULL,
	"notes" text,
	"search_text" text DEFAULT '' NOT NULL,
	"is_recurring_candidate" boolean DEFAULT false NOT NULL,
	"excluded_from_budget" boolean DEFAULT false NOT NULL,
	"transaction_type" text,
	"payment_channel" text,
	"parser_source" text,
	"category_source" text,
	"category_confidence" numeric(3, 2),
	"suggested_category_id" text,
	"suggested_description" text,
	"suggested_merchant_name" text,
	"linked_transaction_id" text,
	"transfer_group_id" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" timestamp,
	"image" text,
	"password_hash" text,
	"default_currency" text DEFAULT 'NOK' NOT NULL,
	"onboarding_complete" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_group_id_category_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."category_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categorization_rules" ADD CONSTRAINT "categorization_rules_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categorization_rules" ADD CONSTRAINT "categorization_rules_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_groups" ADD CONSTRAINT "category_groups_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classification_models" ADD CONSTRAINT "classification_models_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "households" ADD CONSTRAINT "households_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_connections" ADD CONSTRAINT "ingestion_connections_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liabilities" ADD CONSTRAINT "liabilities_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_aliases" ADD CONSTRAINT "merchant_aliases_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_aliases" ADD CONSTRAINT "merchant_aliases_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_default_category_id_categories_id_fk" FOREIGN KEY ("default_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_accounts" ADD CONSTRAINT "provider_accounts_connection_id_ingestion_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."ingestion_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_accounts" ADD CONSTRAINT "provider_accounts_financial_account_id_financial_accounts_id_fk" FOREIGN KEY ("financial_account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_bill_history" ADD CONSTRAINT "recurring_bill_history_bill_id_recurring_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."recurring_bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_bill_history" ADD CONSTRAINT "recurring_bill_history_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_bills" ADD CONSTRAINT "recurring_bills_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_bills" ADD CONSTRAINT "recurring_bills_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_connection_id_ingestion_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."ingestion_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_links" ADD CONSTRAINT "transaction_links_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_links" ADD CONSTRAINT "transaction_links_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_suggested_category_id_categories_id_fk" FOREIGN KEY ("suggested_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_linked_transaction_id_transactions_id_fk" FOREIGN KEY ("linked_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_household_idx" ON "assets" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "audit_events_household_created_idx" ON "audit_events" USING btree ("household_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_action_idx" ON "audit_events" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_events_resource_idx" ON "audit_events" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "auth_accounts_user_id_idx" ON "auth_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_lines_budget_category_uidx" ON "budget_lines" USING btree ("budget_id","category_id");--> statement-breakpoint
CREATE INDEX "budgets_household_idx" ON "budgets" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_household_toplevel_name_uidx" ON "categories" USING btree ("household_id","name") WHERE "categories"."parent_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_household_parent_name_uidx" ON "categories" USING btree ("household_id","parent_id","name") WHERE "categories"."parent_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "categories_household_idx" ON "categories" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "categorization_rules_household_idx" ON "categorization_rules" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "categorization_rules_household_field_matcher_uidx" ON "categorization_rules" USING btree ("household_id","match_field","matcher");--> statement-breakpoint
CREATE UNIQUE INDEX "category_groups_household_key_uidx" ON "category_groups" USING btree ("household_id","key");--> statement-breakpoint
CREATE INDEX "category_groups_household_idx" ON "category_groups" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "classification_models_household_idx" ON "classification_models" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "classification_models_household_version_uidx" ON "classification_models" USING btree ("household_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "exchange_rates_pair_date_uidx" ON "exchange_rates" USING btree ("base_currency","quote_currency","as_of_date");--> statement-breakpoint
CREATE INDEX "financial_accounts_household_idx" ON "financial_accounts" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "financial_accounts_kind_idx" ON "financial_accounts" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "ingestion_connections_household_idx" ON "ingestion_connections" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "ingestion_connections_auth_state_idx" ON "ingestion_connections" USING btree ("authorization_state_hash");--> statement-breakpoint
CREATE INDEX "liabilities_household_idx" ON "liabilities" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_household_user_uidx" ON "memberships" USING btree ("household_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_aliases_household_alias_uidx" ON "merchant_aliases" USING btree ("household_id","normalized_alias");--> statement-breakpoint
CREATE INDEX "merchant_aliases_household_idx" ON "merchant_aliases" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "merchant_aliases_merchant_idx" ON "merchant_aliases" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "merchant_aliases_normalized_trgm_idx" ON "merchant_aliases" USING gin ("normalized_alias" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "merchants_household_idx" ON "merchants" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "merchants_household_normalized_idx" ON "merchants" USING btree ("household_id","normalized_canonical_name");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_accounts_connection_external_uidx" ON "provider_accounts" USING btree ("connection_id","provider_account_id");--> statement-breakpoint
CREATE INDEX "recurring_bill_history_bill_idx" ON "recurring_bill_history" USING btree ("bill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recurring_bill_history_bill_txn_uidx" ON "recurring_bill_history" USING btree ("bill_id","transaction_id");--> statement-breakpoint
CREATE INDEX "recurring_bills_household_idx" ON "recurring_bills" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recurring_bills_household_merchant_sig_uidx" ON "recurring_bills" USING btree ("household_id","merchant_pattern","amount_signature");--> statement-breakpoint
CREATE INDEX "sync_runs_connection_idx" ON "sync_runs" USING btree ("connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_links_group_txn_uidx" ON "transaction_links" USING btree ("group_id","transaction_id");--> statement-breakpoint
CREATE INDEX "transaction_links_household_idx" ON "transaction_links" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "transaction_links_transaction_idx" ON "transaction_links" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "transaction_links_group_idx" ON "transaction_links" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "transactions_household_date_idx" ON "transactions" USING btree ("household_id","date");--> statement-breakpoint
CREATE INDEX "transactions_account_idx" ON "transactions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "transactions_merchant_idx" ON "transactions" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "transactions_category_idx" ON "transactions" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "transactions_search_trgm_idx" ON "transactions" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_source_uidx" ON "transactions" USING btree ("source","source_transaction_id","account_id");--> statement-breakpoint
CREATE INDEX "transactions_transfer_group_idx" ON "transactions" USING btree ("transfer_group_id");