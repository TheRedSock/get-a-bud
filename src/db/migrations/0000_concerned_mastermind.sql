CREATE TYPE "public"."financial_account_kind" AS ENUM('checking', 'savings', 'credit_card', 'cash', 'investment', 'loan', 'mortgage', 'property', 'other');--> statement-breakpoint
CREATE TYPE "public"."bill_cadence" AS ENUM('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly', 'unknown');--> statement-breakpoint
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
	"estimated_value" numeric(18, 2) NOT NULL,
	"valuation_date" date NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
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
	"allocated_amount" numeric(18, 2) NOT NULL,
	"rollover_enabled" boolean DEFAULT false NOT NULL,
	"envelope_balance" numeric(18, 2) DEFAULT '0' NOT NULL
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
	"name" text NOT NULL,
	"color" text DEFAULT 'var(--chart-1)' NOT NULL,
	"icon" text DEFAULT 'circle' NOT NULL,
	"is_income" boolean DEFAULT false NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categorization_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"category_id" text NOT NULL,
	"matcher" text NOT NULL,
	"matcher_type" text DEFAULT 'contains' NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"learned_from_transaction_id" text,
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
	"current_balance" numeric(18, 2) DEFAULT '0' NOT NULL,
	"available_balance" numeric(18, 2),
	"credit_limit" numeric(18, 2),
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
	"current_balance" numeric(18, 2) NOT NULL,
	"interest_rate" numeric(8, 4),
	"minimum_payment" numeric(18, 2),
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
CREATE TABLE "provider_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL,
	"financial_account_id" text,
	"provider_account_id" text NOT NULL,
	"provider_account_name" text,
	"currency" text DEFAULT 'NOK' NOT NULL,
	"last_balance" numeric(18, 2),
	"sync_cursor" text,
	"raw" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_bills" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"category_id" text,
	"name" text NOT NULL,
	"merchant_pattern" text NOT NULL,
	"cadence" "bill_cadence" DEFAULT 'monthly' NOT NULL,
	"expected_amount" numeric(18, 2),
	"next_due_date" date,
	"last_amount" numeric(18, 2),
	"price_increase_threshold_pct" integer DEFAULT 15 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
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
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"account_id" text NOT NULL,
	"category_id" text,
	"source" "transaction_source" DEFAULT 'manual' NOT NULL,
	"source_transaction_id" text,
	"status" "transaction_status" DEFAULT 'posted' NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"currency" text DEFAULT 'NOK' NOT NULL,
	"original_amount" numeric(18, 2),
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
ALTER TABLE "categorization_rules" ADD CONSTRAINT "categorization_rules_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categorization_rules" ADD CONSTRAINT "categorization_rules_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "households" ADD CONSTRAINT "households_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_connections" ADD CONSTRAINT "ingestion_connections_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liabilities" ADD CONSTRAINT "liabilities_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_accounts" ADD CONSTRAINT "provider_accounts_connection_id_ingestion_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."ingestion_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_accounts" ADD CONSTRAINT "provider_accounts_financial_account_id_financial_accounts_id_fk" FOREIGN KEY ("financial_account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_bills" ADD CONSTRAINT "recurring_bills_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_bills" ADD CONSTRAINT "recurring_bills_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_connection_id_ingestion_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."ingestion_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_household_idx" ON "assets" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "auth_accounts_user_id_idx" ON "auth_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_lines_budget_category_uidx" ON "budget_lines" USING btree ("budget_id","category_id");--> statement-breakpoint
CREATE INDEX "budgets_household_idx" ON "budgets" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_household_name_uidx" ON "categories" USING btree ("household_id","name");--> statement-breakpoint
CREATE INDEX "categories_household_idx" ON "categories" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "categorization_rules_household_idx" ON "categorization_rules" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exchange_rates_pair_date_uidx" ON "exchange_rates" USING btree ("base_currency","quote_currency","as_of_date");--> statement-breakpoint
CREATE INDEX "financial_accounts_household_idx" ON "financial_accounts" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "financial_accounts_kind_idx" ON "financial_accounts" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "ingestion_connections_household_idx" ON "ingestion_connections" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "liabilities_household_idx" ON "liabilities" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_household_user_uidx" ON "memberships" USING btree ("household_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_accounts_connection_external_uidx" ON "provider_accounts" USING btree ("connection_id","provider_account_id");--> statement-breakpoint
CREATE INDEX "recurring_bills_household_idx" ON "recurring_bills" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "sync_runs_connection_idx" ON "sync_runs" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "transactions_household_date_idx" ON "transactions" USING btree ("household_id","date");--> statement-breakpoint
CREATE INDEX "transactions_account_idx" ON "transactions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "transactions_category_idx" ON "transactions" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_source_uidx" ON "transactions" USING btree ("source","source_transaction_id","account_id");