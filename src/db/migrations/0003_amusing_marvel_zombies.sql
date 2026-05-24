ALTER TABLE "recurring_bills" ADD COLUMN "suggested_category_id" text;--> statement-breakpoint
ALTER TABLE "recurring_bills" ADD COLUMN "auto_ended_at" timestamp;--> statement-breakpoint
ALTER TABLE "recurring_bills" ADD CONSTRAINT "recurring_bills_suggested_category_id_categories_id_fk" FOREIGN KEY ("suggested_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurring_bill_history_bill_date_idx" ON "recurring_bill_history" USING btree ("bill_id","date");