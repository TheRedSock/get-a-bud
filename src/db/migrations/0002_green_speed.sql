CREATE TYPE "public"."pipeline_activity_kind" AS ENUM('phase_started', 'phase_completed', 'transaction_imported', 'transaction_categorized', 'transfer_linked', 'bill_detected', 'bill_updated', 'account_imported', 'error');--> statement-breakpoint
CREATE TYPE "public"."pipeline_kind" AS ENUM('full_post_sync', 'recurring_replay', 'categorize');--> statement-breakpoint
CREATE TYPE "public"."pipeline_phase" AS ENUM('sync', 'categorize', 'link', 'recurring', 'done');--> statement-breakpoint
CREATE TABLE "household_pipeline_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"kind" "pipeline_kind" NOT NULL,
	"status" "sync_status" DEFAULT 'queued' NOT NULL,
	"current_phase" "pipeline_phase" DEFAULT 'sync' NOT NULL,
	"connection_id" text,
	"sync_run_id" text,
	"counters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"phase_progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_heartbeat_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"error_message" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_activity_events" (
	"id" text PRIMARY KEY NOT NULL,
	"pipeline_run_id" text NOT NULL,
	"household_id" text NOT NULL,
	"kind" "pipeline_activity_kind" NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"payload" jsonb,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "household_pipeline_runs" ADD CONSTRAINT "household_pipeline_runs_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_pipeline_runs" ADD CONSTRAINT "household_pipeline_runs_connection_id_ingestion_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."ingestion_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_pipeline_runs" ADD CONSTRAINT "household_pipeline_runs_sync_run_id_sync_runs_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."sync_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_activity_events" ADD CONSTRAINT "pipeline_activity_events_pipeline_run_id_household_pipeline_runs_id_fk" FOREIGN KEY ("pipeline_run_id") REFERENCES "public"."household_pipeline_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_activity_events" ADD CONSTRAINT "pipeline_activity_events_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "household_pipeline_runs_household_status_idx" ON "household_pipeline_runs" USING btree ("household_id","status");--> statement-breakpoint
CREATE INDEX "household_pipeline_runs_connection_idx" ON "household_pipeline_runs" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "household_pipeline_runs_sync_run_idx" ON "household_pipeline_runs" USING btree ("sync_run_id");--> statement-breakpoint
CREATE INDEX "pipeline_activity_events_run_occurred_idx" ON "pipeline_activity_events" USING btree ("pipeline_run_id","occurred_at");--> statement-breakpoint
CREATE INDEX "pipeline_activity_events_household_idx" ON "pipeline_activity_events" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "transactions_household_updated_id_idx" ON "transactions" USING btree ("household_id","updated_at","id");