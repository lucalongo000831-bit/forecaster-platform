CREATE TABLE "analysis_data_bundle_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"bundle_type" varchar(24) NOT NULL,
	"payload" jsonb NOT NULL,
	"provenance" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"missing_data" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"data_timestamp" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "field_provenance_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"field_path" varchar(220) NOT NULL,
	"provider" varchar(40) NOT NULL,
	"quality" varchar(24) NOT NULL,
	"source_timestamp" timestamp with time zone,
	"formula" text,
	"inputs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issuers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legal_name" varchar(320) NOT NULL,
	"country_code" varchar(2),
	"lei" varchar(20),
	"cik" varchar(10),
	"primary_isin" varchar(12),
	"website" text,
	"sector" varchar(160),
	"industry" varchar(180),
	"identifiers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "instruments" ADD COLUMN "issuer_id" uuid;--> statement-breakpoint
ALTER TABLE "instruments" ADD COLUMN "isin" varchar(12);--> statement-breakpoint
ALTER TABLE "instruments" ADD COLUMN "figi" varchar(20);--> statement-breakpoint
ALTER TABLE "instruments" ADD COLUMN "provider_symbols" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "analysis_data_bundle_snapshots" ADD CONSTRAINT "analysis_data_bundle_snapshots_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_provenance_snapshots" ADD CONSTRAINT "field_provenance_snapshots_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analysis_bundle_instrument_type_time_idx" ON "analysis_data_bundle_snapshots" USING btree ("instrument_id","bundle_type","created_at");--> statement-breakpoint
CREATE INDEX "field_provenance_instrument_field_time_idx" ON "field_provenance_snapshots" USING btree ("instrument_id","field_path","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "issuers_lei_unique" ON "issuers" USING btree ("lei");--> statement-breakpoint
CREATE UNIQUE INDEX "issuers_cik_unique" ON "issuers" USING btree ("cik");--> statement-breakpoint
CREATE INDEX "issuers_name_idx" ON "issuers" USING btree ("legal_name");--> statement-breakpoint
ALTER TABLE "instruments" ADD CONSTRAINT "instruments_issuer_id_issuers_id_fk" FOREIGN KEY ("issuer_id") REFERENCES "public"."issuers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "instruments_issuer_idx" ON "instruments" USING btree ("issuer_id");