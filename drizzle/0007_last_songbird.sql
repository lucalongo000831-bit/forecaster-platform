CREATE TYPE "public"."political_chamber" AS ENUM('HOUSE', 'SENATE', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."political_owner_type" AS ENUM('SELF', 'SPOUSE', 'DEPENDENT', 'JOINT', 'TRUST', 'OTHER', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."political_party" AS ENUM('DEMOCRATIC', 'REPUBLICAN', 'INDEPENDENT', 'OTHER', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."political_transaction_kind" AS ENUM('PURCHASE', 'SALE_FULL', 'SALE_PARTIAL', 'SALE', 'EXCHANGE', 'OPTION', 'OTHER', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."political_verification_status" AS ENUM('PROVIDER_ONLY', 'OFFICIAL_SOURCE_VERIFIED', 'SOURCE_MISMATCH', 'PENDING', 'UNVERIFIABLE');--> statement-breakpoint
CREATE TABLE "political_activity_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid,
	"period" varchar(16) NOT NULL,
	"purchase_count" integer NOT NULL,
	"sale_count" integer NOT NULL,
	"purchase_min" numeric(38, 4) NOT NULL,
	"purchase_max" numeric(38, 4) NOT NULL,
	"sale_min" numeric(38, 4) NOT NULL,
	"sale_max" numeric(38, 4) NOT NULL,
	"unique_buyers" integer NOT NULL,
	"unique_sellers" integer NOT NULL,
	"house_count" integer NOT NULL,
	"senate_count" integer NOT NULL,
	"cluster_buying" varchar(16) NOT NULL,
	"cluster_selling" varchar(16) NOT NULL,
	"intensity_score" numeric(8, 4) NOT NULL,
	"direction" varchar(32) NOT NULL,
	"confidence" varchar(20) NOT NULL,
	"payload" jsonb NOT NULL,
	"model_version" varchar(80) NOT NULL,
	"calculated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "political_asset_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"raw_alias" varchar(320) NOT NULL,
	"normalized_alias" varchar(320) NOT NULL,
	"instrument_id" uuid NOT NULL,
	"confidence" numeric(8, 6) NOT NULL,
	"source" varchar(80) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "political_clusters" (
	"id" varchar(100) PRIMARY KEY NOT NULL,
	"instrument_id" uuid,
	"symbol" varchar(64),
	"direction" varchar(16) NOT NULL,
	"strength" varchar(16) NOT NULL,
	"window_days" integer NOT NULL,
	"unique_politicians" integer NOT NULL,
	"transaction_count" integer NOT NULL,
	"estimated_amount" numeric(38, 4) NOT NULL,
	"first_disclosure_date" timestamp with time zone NOT NULL,
	"last_disclosure_date" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL,
	"model_version" varchar(80) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "political_data_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"political_transaction_id" uuid NOT NULL,
	"status" "political_verification_status" NOT NULL,
	"source_url" text,
	"provider_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"official_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"conflicts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "political_filings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"politician_id" varchar(80) NOT NULL,
	"provider" varchar(40) NOT NULL,
	"source_id" varchar(220) NOT NULL,
	"filing_type" varchar(80),
	"disclosure_date" timestamp with time zone NOT NULL,
	"source_url" text,
	"amendment" boolean DEFAULT false NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "political_leaderboard_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period" varchar(16) NOT NULL,
	"payload" jsonb NOT NULL,
	"data_completeness" numeric(8, 4) NOT NULL,
	"model_version" varchar(80) NOT NULL,
	"calculated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "political_sync_states" (
	"key" varchar(80) PRIMARY KEY NOT NULL,
	"last_successful_sync" timestamp with time zone,
	"house_records" integer DEFAULT 0 NOT NULL,
	"senate_records" integer DEFAULT 0 NOT NULL,
	"mapped_instruments" integer DEFAULT 0 NOT NULL,
	"unresolved_assets" integer DEFAULT 0 NOT NULL,
	"duplicates_removed" integer DEFAULT 0 NOT NULL,
	"latest_disclosure" timestamp with time zone,
	"provider_status" varchar(24) DEFAULT 'UNKNOWN' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "political_trade_performances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"political_transaction_id" uuid NOT NULL,
	"benchmark_symbol" varchar(64) NOT NULL,
	"market_available_date" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL,
	"classification" varchar(32) NOT NULL,
	"model_version" varchar(80) NOT NULL,
	"calculated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "political_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" varchar(220) NOT NULL,
	"fingerprint" varchar(80) NOT NULL,
	"politician_id" varchar(80) NOT NULL,
	"filing_id" uuid,
	"instrument_id" uuid,
	"canonical_issuer_id" uuid,
	"chamber" "political_chamber" NOT NULL,
	"party" "political_party" NOT NULL,
	"state" varchar(80),
	"district" varchar(120),
	"owner_type" "political_owner_type" NOT NULL,
	"asset_name" text NOT NULL,
	"asset_type" varchar(120),
	"raw_ticker" varchar(100),
	"symbol" varchar(100),
	"sector" varchar(160),
	"transaction_type" "political_transaction_kind" NOT NULL,
	"transaction_date" timestamp with time zone NOT NULL,
	"disclosure_date" timestamp with time zone NOT NULL,
	"market_available_date" timestamp with time zone NOT NULL,
	"disclosure_delay_days" integer NOT NULL,
	"amount_min" numeric(38, 4),
	"amount_max" numeric(38, 4),
	"amount_range_raw" varchar(160),
	"estimated_amount" numeric(38, 4),
	"amount_method" varchar(32) NOT NULL,
	"price_at_transaction" numeric(30, 10),
	"price_at_disclosure" numeric(30, 10),
	"current_price" numeric(30, 10),
	"shares_estimate" numeric(38, 10),
	"source" text NOT NULL,
	"source_url" text,
	"filing_type" varchar(80),
	"provider" varchar(40) NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"verification_status" "political_verification_status" NOT NULL,
	"resolution_status" varchar(32) NOT NULL,
	"amendment" boolean DEFAULT false NOT NULL,
	"raw_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "politicians" (
	"id" varchar(80) PRIMARY KEY NOT NULL,
	"normalized_name" varchar(220) NOT NULL,
	"display_name" varchar(220) NOT NULL,
	"chamber" "political_chamber" DEFAULT 'UNKNOWN' NOT NULL,
	"party" "political_party" DEFAULT 'UNKNOWN' NOT NULL,
	"state" varchar(80),
	"district" varchar(120),
	"active_status" varchar(20) DEFAULT 'UNKNOWN' NOT NULL,
	"source_identifiers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "political_activity_snapshots" ADD CONSTRAINT "political_activity_snapshots_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "political_asset_aliases" ADD CONSTRAINT "political_asset_aliases_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "political_clusters" ADD CONSTRAINT "political_clusters_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "political_data_verifications" ADD CONSTRAINT "political_data_verifications_political_transaction_id_political_transactions_id_fk" FOREIGN KEY ("political_transaction_id") REFERENCES "public"."political_transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "political_filings" ADD CONSTRAINT "political_filings_politician_id_politicians_id_fk" FOREIGN KEY ("politician_id") REFERENCES "public"."politicians"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "political_trade_performances" ADD CONSTRAINT "political_trade_performances_political_transaction_id_political_transactions_id_fk" FOREIGN KEY ("political_transaction_id") REFERENCES "public"."political_transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "political_transactions" ADD CONSTRAINT "political_transactions_politician_id_politicians_id_fk" FOREIGN KEY ("politician_id") REFERENCES "public"."politicians"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "political_transactions" ADD CONSTRAINT "political_transactions_filing_id_political_filings_id_fk" FOREIGN KEY ("filing_id") REFERENCES "public"."political_filings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "political_transactions" ADD CONSTRAINT "political_transactions_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "political_transactions" ADD CONSTRAINT "political_transactions_canonical_issuer_id_issuers_id_fk" FOREIGN KEY ("canonical_issuer_id") REFERENCES "public"."issuers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "political_activity_instrument_period_time_idx" ON "political_activity_snapshots" USING btree ("instrument_id","period","calculated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "political_asset_alias_unique" ON "political_asset_aliases" USING btree ("normalized_alias");--> statement-breakpoint
CREATE INDEX "political_asset_alias_instrument_idx" ON "political_asset_aliases" USING btree ("instrument_id");--> statement-breakpoint
CREATE INDEX "political_cluster_instrument_date_idx" ON "political_clusters" USING btree ("instrument_id","last_disclosure_date");--> statement-breakpoint
CREATE INDEX "political_cluster_strength_idx" ON "political_clusters" USING btree ("strength","last_disclosure_date");--> statement-breakpoint
CREATE INDEX "political_verification_transaction_idx" ON "political_data_verifications" USING btree ("political_transaction_id","created_at");--> statement-breakpoint
CREATE INDEX "political_verification_status_idx" ON "political_data_verifications" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "political_filings_provider_source_unique" ON "political_filings" USING btree ("provider","source_id");--> statement-breakpoint
CREATE INDEX "political_filings_politician_date_idx" ON "political_filings" USING btree ("politician_id","disclosure_date");--> statement-breakpoint
CREATE INDEX "political_leaderboard_period_time_idx" ON "political_leaderboard_snapshots" USING btree ("period","calculated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "political_performance_transaction_model_unique" ON "political_trade_performances" USING btree ("political_transaction_id","model_version");--> statement-breakpoint
CREATE INDEX "political_performance_available_date_idx" ON "political_trade_performances" USING btree ("market_available_date");--> statement-breakpoint
CREATE UNIQUE INDEX "political_transactions_fingerprint_unique" ON "political_transactions" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "political_transactions_politician_idx" ON "political_transactions" USING btree ("politician_id");--> statement-breakpoint
CREATE INDEX "political_transactions_instrument_disclosure_idx" ON "political_transactions" USING btree ("instrument_id","disclosure_date");--> statement-breakpoint
CREATE INDEX "political_transactions_transaction_date_idx" ON "political_transactions" USING btree ("transaction_date");--> statement-breakpoint
CREATE INDEX "political_transactions_disclosure_date_idx" ON "political_transactions" USING btree ("disclosure_date");--> statement-breakpoint
CREATE INDEX "political_transactions_chamber_type_idx" ON "political_transactions" USING btree ("chamber","transaction_type");--> statement-breakpoint
CREATE INDEX "political_transactions_issuer_idx" ON "political_transactions" USING btree ("canonical_issuer_id");--> statement-breakpoint
CREATE INDEX "political_transactions_created_idx" ON "political_transactions" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "politicians_normalized_identity_unique" ON "politicians" USING btree ("normalized_name","chamber","state");--> statement-breakpoint
CREATE INDEX "politicians_name_idx" ON "politicians" USING btree ("display_name");