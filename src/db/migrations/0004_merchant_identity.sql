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
ALTER TABLE "transactions" ADD COLUMN "merchant_id" text;
--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_default_category_id_categories_id_fk" FOREIGN KEY ("default_category_id") REFERENCES "categories"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "merchant_aliases" ADD CONSTRAINT "merchant_aliases_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "merchant_aliases" ADD CONSTRAINT "merchant_aliases_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "merchants_household_idx" ON "merchants" USING btree ("household_id");
--> statement-breakpoint
CREATE INDEX "merchants_household_normalized_idx" ON "merchants" USING btree ("household_id","normalized_canonical_name");
--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_aliases_household_alias_uidx" ON "merchant_aliases" USING btree ("household_id","normalized_alias");
--> statement-breakpoint
CREATE INDEX "merchant_aliases_household_idx" ON "merchant_aliases" USING btree ("household_id");
--> statement-breakpoint
CREATE INDEX "merchant_aliases_merchant_idx" ON "merchant_aliases" USING btree ("merchant_id");
--> statement-breakpoint
CREATE INDEX "merchant_aliases_normalized_trgm_idx" ON "merchant_aliases" USING gin ("normalized_alias" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "transactions_merchant_idx" ON "transactions" USING btree ("merchant_id");
