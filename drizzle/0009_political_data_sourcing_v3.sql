ALTER TYPE "public"."political_verification_status" ADD VALUE IF NOT EXISTS 'BARGO_ONLY';
ALTER TYPE "public"."political_verification_status" ADD VALUE IF NOT EXISTS 'FMP_ONLY';
ALTER TYPE "public"."political_verification_status" ADD VALUE IF NOT EXISTS 'CAPITOL_EXPOSED_ONLY';
ALTER TYPE "public"."political_verification_status" ADD VALUE IF NOT EXISTS 'BARGO_FMP_MATCH';
ALTER TYPE "public"."political_verification_status" ADD VALUE IF NOT EXISTS 'HOUSE_OFFICIAL_VERIFIED';
ALTER TYPE "public"."political_verification_status" ADD VALUE IF NOT EXISTS 'SENATE_OFFICIAL_VERIFIED';
ALTER TYPE "public"."political_verification_status" ADD VALUE IF NOT EXISTS 'MULTI_SOURCE_VERIFIED';
ALTER TYPE "public"."political_verification_status" ADD VALUE IF NOT EXISTS 'CONFLICT';
ALTER TYPE "public"."political_verification_status" ADD VALUE IF NOT EXISTS 'PENDING_VERIFICATION';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "political_transaction_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"political_transaction_id" uuid NOT NULL,
	"provider" varchar(40) NOT NULL,
	"external_id" varchar(240) NOT NULL,
	"source_url" text,
	"raw_hash" varchar(64) NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"verification_status" varchar(48) NOT NULL,
	"raw_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "political_transaction_sources_political_transaction_id_political_transactions_id_fk" FOREIGN KEY ("political_transaction_id") REFERENCES "public"."political_transactions"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "political_transaction_source_unique" ON "political_transaction_sources" USING btree ("provider","external_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "political_transaction_source_transaction_idx" ON "political_transaction_sources" USING btree ("political_transaction_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "political_transaction_source_status_idx" ON "political_transaction_sources" USING btree ("verification_status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "political_history_months" (
	"month" varchar(7) PRIMARY KEY NOT NULL,
	"status" varchar(24) NOT NULL,
	"record_count" integer DEFAULT 0 NOT NULL,
	"house_records" integer DEFAULT 0 NOT NULL,
	"senate_records" integer DEFAULT 0 NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"checked_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
