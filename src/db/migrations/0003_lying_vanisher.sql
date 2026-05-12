CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "transactions_search_trgm_idx" ON "transactions" USING gin ("search_text" gin_trgm_ops);