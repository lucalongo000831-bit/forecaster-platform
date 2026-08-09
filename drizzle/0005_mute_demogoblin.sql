CREATE TABLE "global_market_brief_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brief_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"state" varchar(20) DEFAULT 'DRAFT' NOT NULL,
	"title" varchar(240) NOT NULL,
	"report_date" timestamp with time zone NOT NULL,
	"status" varchar(16) NOT NULL,
	"systemic_stress" varchar(16) NOT NULL,
	"risk_trend" varchar(32) NOT NULL,
	"summary" text NOT NULL,
	"raw_text" text NOT NULL,
	"parsed_data" jsonb NOT NULL,
	"published_by" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "global_market_briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(80) NOT NULL,
	"current_version" integer DEFAULT 0 NOT NULL,
	"state" varchar(20) DEFAULT 'DRAFT' NOT NULL,
	"created_by" uuid,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "global_risk_component_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"component" varchar(40) NOT NULL,
	"score" numeric(8, 4),
	"weight" numeric(8, 6) NOT NULL,
	"contribution" numeric(8, 4) NOT NULL,
	"completeness" numeric(8, 4) NOT NULL,
	"data_type" varchar(24) NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "global_risk_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" varchar(16) NOT NULL,
	"score" numeric(8, 4) NOT NULL,
	"systemic_stress" varchar(16) NOT NULL,
	"trend" varchar(32) NOT NULL,
	"confidence" varchar(20) NOT NULL,
	"data_completeness" numeric(8, 4) NOT NULL,
	"volatility_score" numeric(8, 4),
	"credit_score" numeric(8, 4),
	"liquidity_score" numeric(8, 4),
	"rates_score" numeric(8, 4),
	"breadth_score" numeric(8, 4),
	"equity_score" numeric(8, 4),
	"cross_asset_score" numeric(8, 4),
	"macro_score" numeric(8, 4),
	"news_risk_score" numeric(8, 4),
	"payload" jsonb NOT NULL,
	"model_version" varchar(80) NOT NULL,
	"input_timestamp" timestamp with time zone NOT NULL,
	"calculated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "global_risk_triggers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"trigger_key" varchar(80) NOT NULL,
	"direction" varchar(20) NOT NULL,
	"label" text NOT NULL,
	"threshold" text NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "global_market_brief_versions" ADD CONSTRAINT "global_market_brief_versions_brief_id_global_market_briefs_id_fk" FOREIGN KEY ("brief_id") REFERENCES "public"."global_market_briefs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_market_brief_versions" ADD CONSTRAINT "global_market_brief_versions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_market_briefs" ADD CONSTRAINT "global_market_briefs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_risk_component_snapshots" ADD CONSTRAINT "global_risk_component_snapshots_snapshot_id_global_risk_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."global_risk_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_risk_triggers" ADD CONSTRAINT "global_risk_triggers_snapshot_id_global_risk_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."global_risk_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "global_market_brief_version_unique" ON "global_market_brief_versions" USING btree ("brief_id","version");--> statement-breakpoint
CREATE INDEX "global_market_brief_version_published_idx" ON "global_market_brief_versions" USING btree ("state","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "global_market_brief_slug_unique" ON "global_market_briefs" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "global_market_brief_state_idx" ON "global_market_briefs" USING btree ("state","published_at");--> statement-breakpoint
CREATE INDEX "global_risk_component_snapshot_idx" ON "global_risk_component_snapshots" USING btree ("snapshot_id","component");--> statement-breakpoint
CREATE INDEX "global_risk_calculated_idx" ON "global_risk_snapshots" USING btree ("calculated_at");--> statement-breakpoint
CREATE INDEX "global_risk_status_idx" ON "global_risk_snapshots" USING btree ("status","calculated_at");--> statement-breakpoint
CREATE INDEX "global_risk_trigger_snapshot_idx" ON "global_risk_triggers" USING btree ("snapshot_id","direction");