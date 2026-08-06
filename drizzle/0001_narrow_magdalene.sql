CREATE TABLE "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" varchar(40) NOT NULL,
	"symbol" varchar(64),
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"provider" varchar(40) NOT NULL,
	"provider_record_id" varchar(220) NOT NULL,
	"source_timestamp" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data_quality" "data_quality" DEFAULT 'PARTIAL' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_provider_record_unique" ON "calendar_events" USING btree ("provider","provider_record_id");--> statement-breakpoint
CREATE INDEX "calendar_event_time_idx" ON "calendar_events" USING btree ("starts_at","event_type");--> statement-breakpoint
CREATE INDEX "calendar_event_symbol_idx" ON "calendar_events" USING btree ("symbol","starts_at");