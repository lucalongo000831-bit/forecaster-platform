CREATE TABLE "data_conflicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset" varchar(100) NOT NULL,
	"entity_key" varchar(240) NOT NULL,
	"field" varchar(220) NOT NULL,
	"primary_source" varchar(60) NOT NULL,
	"alternate_source" varchar(60) NOT NULL,
	"primary_value" jsonb,
	"alternate_value" jsonb,
	"resolution" varchar(40) DEFAULT 'UNRESOLVED' NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_quality_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset" varchar(100) NOT NULL,
	"entity_key" varchar(240) DEFAULT 'global' NOT NULL,
	"snapshot_id" uuid,
	"status" varchar(32) NOT NULL,
	"coverage" numeric(8, 4),
	"freshness_score" numeric(8, 4),
	"source_quality" numeric(8, 4),
	"conflict_rate" numeric(8, 4),
	"mapping_rate" numeric(8, 4),
	"anomalies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evaluated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset" varchar(100) NOT NULL,
	"entity_key" varchar(240) DEFAULT 'global' NOT NULL,
	"status" varchar(32) NOT NULL,
	"freshness" varchar(24) NOT NULL,
	"payload" jsonb NOT NULL,
	"record_count" integer NOT NULL,
	"coverage" numeric(8, 4),
	"source_timestamp" timestamp with time zone,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"schema_version" varchar(40) NOT NULL,
	"model_version" varchar(80),
	"published" boolean DEFAULT false NOT NULL,
	"quality_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "economic_release_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"series_id" uuid,
	"provider" varchar(40) NOT NULL,
	"source_id" varchar(220) NOT NULL,
	"title" text NOT NULL,
	"country" varchar(8),
	"importance" varchar(16) DEFAULT 'MEDIUM' NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone,
	"available_at" timestamp with time zone,
	"actual" numeric(38, 12),
	"forecast" numeric(38, 12),
	"previous" numeric(38, 12),
	"status" varchar(32) DEFAULT 'AVAILABLE' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "economic_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"internal_key" varchar(100) NOT NULL,
	"provider" varchar(40) NOT NULL,
	"external_series_id" varchar(160) NOT NULL,
	"country" varchar(8),
	"category" varchar(60) NOT NULL,
	"frequency" varchar(24) NOT NULL,
	"unit" varchar(80),
	"importance" varchar(16) DEFAULT 'MEDIUM' NOT NULL,
	"transform" varchar(24) DEFAULT 'LEVEL' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"dataset" varchar(100) NOT NULL,
	"provider" varchar(40),
	"schedule" varchar(80),
	"enabled" boolean DEFAULT true NOT NULL,
	"priority" varchar(16) DEFAULT 'BACKGROUND' NOT NULL,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid,
	"job_name" varchar(120) NOT NULL,
	"provider" varchar(40),
	"status" varchar(30) NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"records_fetched" integer DEFAULT 0 NOT NULL,
	"records_inserted" integer DEFAULT 0 NOT NULL,
	"records_updated" integer DEFAULT 0 NOT NULL,
	"records_skipped" integer DEFAULT 0 NOT NULL,
	"errors" integer DEFAULT 0 NOT NULL,
	"watermark" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_class" varchar(40),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "last_known_good" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset" varchar(100) NOT NULL,
	"entity_key" varchar(240) DEFAULT 'global' NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"promoted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_until" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "normalized_economic_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"series_id" uuid NOT NULL,
	"value" numeric(38, 12),
	"observed_at" timestamp with time zone NOT NULL,
	"effective_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"available_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" varchar(32) DEFAULT 'AVAILABLE' NOT NULL,
	"provider" varchar(40) NOT NULL,
	"schema_version" varchar(40) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "normalized_market_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"metric" varchar(80) NOT NULL,
	"value" numeric(38, 12),
	"unit" varchar(40),
	"observed_at" timestamp with time zone NOT NULL,
	"effective_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"available_at" timestamp with time zone NOT NULL,
	"provider" varchar(40) NOT NULL,
	"status" varchar(32) DEFAULT 'AVAILABLE' NOT NULL,
	"schema_version" varchar(40) NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "positioning_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market" varchar(120) NOT NULL,
	"contract" varchar(180) NOT NULL,
	"category" varchar(100) NOT NULL,
	"long" numeric(38, 4),
	"short" numeric(38, 4),
	"spreading" numeric(38, 4),
	"net" numeric(38, 4),
	"open_interest" numeric(38, 4),
	"report_date" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"source" varchar(60) NOT NULL,
	"source_id" varchar(220) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_quota_states" (
	"provider" varchar(40) PRIMARY KEY NOT NULL,
	"minute_count" integer DEFAULT 0 NOT NULL,
	"hour_count" integer DEFAULT 0 NOT NULL,
	"day_count" integer DEFAULT 0 NOT NULL,
	"reserved_remaining" integer,
	"window_minute" timestamp with time zone,
	"window_hour" timestamp with time zone,
	"window_day" timestamp with time zone,
	"circuit_state" varchar(24) DEFAULT 'UNKNOWN' NOT NULL,
	"circuit_open_until" timestamp with time zone,
	"last_rate_limited_at" timestamp with time zone,
	"failures_today" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(40) NOT NULL,
	"dataset" varchar(100) NOT NULL,
	"operation" varchar(100) NOT NULL,
	"priority" varchar(16) DEFAULT 'NORMAL' NOT NULL,
	"status" varchar(30) NOT NULL,
	"http_status" integer,
	"latency_ms" integer,
	"records_fetched" integer DEFAULT 0 NOT NULL,
	"records_stored" integer DEFAULT 0 NOT NULL,
	"error_class" varchar(40),
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_watermarks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(40) NOT NULL,
	"dataset" varchar(100) NOT NULL,
	"last_attempt" timestamp with time zone,
	"last_successful_sync" timestamp with time zone,
	"last_external_timestamp" timestamp with time zone,
	"cursor" text,
	"latest_record_id" varchar(220),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_provider_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(40) NOT NULL,
	"dataset" varchar(100) NOT NULL,
	"external_id" varchar(240),
	"entity_key" varchar(240) NOT NULL,
	"instrument_id" uuid,
	"issuer_id" uuid,
	"payload" jsonb NOT NULL,
	"payload_hash" varchar(64) NOT NULL,
	"source_url" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_published_at" timestamp with time zone,
	"schema_version" varchar(40) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_source_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" varchar(60) NOT NULL,
	"dataset" varchar(100) NOT NULL,
	"external_id" varchar(240) NOT NULL,
	"entity_key" varchar(240) NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"media_type" varchar(120),
	"source_url" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"available_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"schema_version" varchar(40) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "data_quality_records" ADD CONSTRAINT "data_quality_records_snapshot_id_data_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."data_snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_release_events" ADD CONSTRAINT "economic_release_events_series_id_economic_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."economic_series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_runs" ADD CONSTRAINT "ingestion_runs_job_id_ingestion_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."ingestion_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "last_known_good" ADD CONSTRAINT "last_known_good_snapshot_id_data_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."data_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "normalized_economic_observations" ADD CONSTRAINT "normalized_economic_observations_series_id_economic_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."economic_series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "normalized_market_observations" ADD CONSTRAINT "normalized_market_observations_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_provider_records" ADD CONSTRAINT "raw_provider_records_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_provider_records" ADD CONSTRAINT "raw_provider_records_issuer_id_issuers_id_fk" FOREIGN KEY ("issuer_id") REFERENCES "public"."issuers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "data_conflict_dataset_idx" ON "data_conflicts" USING btree ("dataset","entity_key","detected_at");--> statement-breakpoint
CREATE INDEX "data_quality_dataset_time_idx" ON "data_quality_records" USING btree ("dataset","entity_key","evaluated_at");--> statement-breakpoint
CREATE INDEX "data_snapshot_dataset_time_idx" ON "data_snapshots" USING btree ("dataset","entity_key","calculated_at");--> statement-breakpoint
CREATE INDEX "data_snapshot_published_idx" ON "data_snapshots" USING btree ("published","dataset");--> statement-breakpoint
CREATE UNIQUE INDEX "economic_release_provider_source_unique" ON "economic_release_events" USING btree ("provider","source_id");--> statement-breakpoint
CREATE INDEX "economic_release_time_idx" ON "economic_release_events" USING btree ("scheduled_at","country");--> statement-breakpoint
CREATE UNIQUE INDEX "economic_series_internal_unique" ON "economic_series" USING btree ("internal_key");--> statement-breakpoint
CREATE UNIQUE INDEX "economic_series_provider_external_unique" ON "economic_series" USING btree ("provider","external_series_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ingestion_job_name_unique" ON "ingestion_jobs" USING btree ("name");--> statement-breakpoint
CREATE INDEX "ingestion_job_dataset_idx" ON "ingestion_jobs" USING btree ("dataset","enabled");--> statement-breakpoint
CREATE INDEX "ingestion_run_job_time_idx" ON "ingestion_runs" USING btree ("job_name","started_at");--> statement-breakpoint
CREATE INDEX "ingestion_run_status_idx" ON "ingestion_runs" USING btree ("status","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "last_known_good_dataset_entity_unique" ON "last_known_good" USING btree ("dataset","entity_key");--> statement-breakpoint
CREATE INDEX "last_known_good_snapshot_idx" ON "last_known_good" USING btree ("snapshot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "economic_observation_unique" ON "normalized_economic_observations" USING btree ("series_id","observed_at","available_at","provider");--> statement-breakpoint
CREATE INDEX "economic_observation_series_time_idx" ON "normalized_economic_observations" USING btree ("series_id","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "normalized_market_observation_unique" ON "normalized_market_observations" USING btree ("instrument_id","metric","observed_at","provider");--> statement-breakpoint
CREATE INDEX "normalized_market_metric_time_idx" ON "normalized_market_observations" USING btree ("instrument_id","metric","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "positioning_source_record_unique" ON "positioning_observations" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "positioning_contract_date_idx" ON "positioning_observations" USING btree ("contract","report_date");--> statement-breakpoint
CREATE INDEX "provider_runs_provider_time_idx" ON "provider_runs" USING btree ("provider","started_at");--> statement-breakpoint
CREATE INDEX "provider_runs_dataset_status_idx" ON "provider_runs" USING btree ("dataset","status");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_watermark_unique" ON "provider_watermarks" USING btree ("provider","dataset");--> statement-breakpoint
CREATE INDEX "provider_watermark_sync_idx" ON "provider_watermarks" USING btree ("last_successful_sync");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_provider_payload_unique" ON "raw_provider_records" USING btree ("provider","dataset","payload_hash");--> statement-breakpoint
CREATE INDEX "raw_provider_entity_idx" ON "raw_provider_records" USING btree ("entity_key","fetched_at");--> statement-breakpoint
CREATE INDEX "raw_provider_instrument_idx" ON "raw_provider_records" USING btree ("instrument_id","dataset");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_source_document_unique" ON "raw_source_documents" USING btree ("source","external_id","content_hash");--> statement-breakpoint
CREATE INDEX "raw_source_document_entity_idx" ON "raw_source_documents" USING btree ("entity_key","published_at");