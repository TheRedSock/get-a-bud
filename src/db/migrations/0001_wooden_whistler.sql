ALTER TABLE "ingestion_connections" ADD COLUMN "authorization_id" text;--> statement-breakpoint
ALTER TABLE "ingestion_connections" ADD COLUMN "authorization_state_hash" text;--> statement-breakpoint
ALTER TABLE "ingestion_connections" ADD COLUMN "authorization_state_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "ingestion_connections" ADD COLUMN "consent_expires_at" timestamp;--> statement-breakpoint
CREATE INDEX "ingestion_connections_auth_state_idx" ON "ingestion_connections" USING btree ("authorization_state_hash");