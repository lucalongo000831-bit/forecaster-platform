CREATE TABLE "company_analysis_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"model_version" varchar(80) NOT NULL,
	"data_timestamp" timestamp with time zone,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"methodology_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_analysis_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"model_version" varchar(80) NOT NULL,
	"data_timestamp" timestamp with time zone,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"methodology_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"symbol" varchar(64) NOT NULL,
	"market" varchar(80) NOT NULL,
	"score" numeric(8, 4),
	"verdict" varchar(40) NOT NULL,
	"short_verdict" varchar(40),
	"quality_score" numeric(8, 4),
	"growth_score" numeric(8, 4),
	"valuation_score" numeric(8, 4),
	"risk_score" numeric(8, 4),
	"moat_score" numeric(8, 4),
	"management_score" numeric(8, 4),
	"earnings_quality_score" numeric(8, 4),
	"fair_value" numeric(30, 10),
	"bear_value" numeric(30, 10),
	"base_value" numeric(30, 10),
	"bull_value" numeric(30, 10),
	"attractive_price_low" numeric(30, 10),
	"attractive_price_high" numeric(30, 10),
	"avoid_price" numeric(30, 10),
	"margin_of_safety" numeric(18, 8),
	"confidence" varchar(24) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_catalysts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"model_version" varchar(80) NOT NULL,
	"data_timestamp" timestamp with time zone,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"methodology_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_quality_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"model_version" varchar(80) NOT NULL,
	"data_timestamp" timestamp with time zone,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"methodology_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_red_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"model_version" varchar(80) NOT NULL,
	"data_timestamp" timestamp with time zone,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"methodology_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_outlooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"model_version" varchar(80) NOT NULL,
	"data_timestamp" timestamp with time zone,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"methodology_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dcf_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"model_version" varchar(80) NOT NULL,
	"data_timestamp" timestamp with time zone,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"methodology_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "earnings_quality_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"model_version" varchar(80) NOT NULL,
	"data_timestamp" timestamp with time zone,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"methodology_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investment_scenarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"model_version" varchar(80) NOT NULL,
	"data_timestamp" timestamp with time zone,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"methodology_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investment_theses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"model_version" varchar(80) NOT NULL,
	"data_timestamp" timestamp with time zone,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"methodology_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "management_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"model_version" varchar(80) NOT NULL,
	"data_timestamp" timestamp with time zone,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"methodology_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moat_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"model_version" varchar(80) NOT NULL,
	"data_timestamp" timestamp with time zone,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"methodology_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operational_calendar_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"model_version" varchar(80) NOT NULL,
	"data_timestamp" timestamp with time zone,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"methodology_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "peer_comparison_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"model_version" varchar(80) NOT NULL,
	"data_timestamp" timestamp with time zone,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"methodology_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "peer_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"model_version" varchar(80) NOT NULL,
	"data_timestamp" timestamp with time zone,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"methodology_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reverse_dcf_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"model_version" varchar(80) NOT NULL,
	"data_timestamp" timestamp with time zone,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"methodology_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_register_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"model_version" varchar(80) NOT NULL,
	"data_timestamp" timestamp with time zone,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"methodology_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_horizon_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"model_version" varchar(80) NOT NULL,
	"data_timestamp" timestamp with time zone,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"methodology_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"horizon" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "valuation_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"model_version" varchar(80) NOT NULL,
	"data_timestamp" timestamp with time zone,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"methodology_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_analysis_reports" ADD CONSTRAINT "company_analysis_reports_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_analysis_snapshots" ADD CONSTRAINT "company_analysis_snapshots_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_catalysts" ADD CONSTRAINT "company_catalysts_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_quality_snapshots" ADD CONSTRAINT "company_quality_snapshots_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_red_flags" ADD CONSTRAINT "company_red_flags_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_outlooks" ADD CONSTRAINT "daily_outlooks_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dcf_runs" ADD CONSTRAINT "dcf_runs_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "earnings_quality_snapshots" ADD CONSTRAINT "earnings_quality_snapshots_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_scenarios" ADD CONSTRAINT "investment_scenarios_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_theses" ADD CONSTRAINT "investment_theses_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "management_assessments" ADD CONSTRAINT "management_assessments_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moat_assessments" ADD CONSTRAINT "moat_assessments_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_calendar_snapshots" ADD CONSTRAINT "operational_calendar_snapshots_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_comparison_snapshots" ADD CONSTRAINT "peer_comparison_snapshots_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_groups" ADD CONSTRAINT "peer_groups_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reverse_dcf_runs" ADD CONSTRAINT "reverse_dcf_runs_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_register_items" ADD CONSTRAINT "risk_register_items_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_horizon_assessments" ADD CONSTRAINT "time_horizon_assessments_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "valuation_snapshots" ADD CONSTRAINT "valuation_snapshots_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_report_time_idx" ON "company_analysis_reports" USING btree ("instrument_id","calculated_at");--> statement-breakpoint
CREATE INDEX "company_analysis_instrument_time_idx" ON "company_analysis_snapshots" USING btree ("instrument_id","calculated_at");--> statement-breakpoint
CREATE INDEX "company_analysis_symbol_time_idx" ON "company_analysis_snapshots" USING btree ("symbol","calculated_at");--> statement-breakpoint
CREATE INDEX "company_catalyst_time_idx" ON "company_catalysts" USING btree ("instrument_id","calculated_at");--> statement-breakpoint
CREATE INDEX "company_quality_time_idx" ON "company_quality_snapshots" USING btree ("instrument_id","calculated_at");--> statement-breakpoint
CREATE INDEX "company_red_flag_time_idx" ON "company_red_flags" USING btree ("instrument_id","calculated_at");--> statement-breakpoint
CREATE INDEX "daily_outlook_time_idx" ON "daily_outlooks" USING btree ("instrument_id","calculated_at");--> statement-breakpoint
CREATE INDEX "dcf_run_time_idx" ON "dcf_runs" USING btree ("instrument_id","calculated_at");--> statement-breakpoint
CREATE INDEX "earnings_quality_time_idx" ON "earnings_quality_snapshots" USING btree ("instrument_id","calculated_at");--> statement-breakpoint
CREATE INDEX "investment_scenario_time_idx" ON "investment_scenarios" USING btree ("instrument_id","calculated_at");--> statement-breakpoint
CREATE INDEX "investment_thesis_time_idx" ON "investment_theses" USING btree ("instrument_id","calculated_at");--> statement-breakpoint
CREATE INDEX "management_assessment_time_idx" ON "management_assessments" USING btree ("instrument_id","calculated_at");--> statement-breakpoint
CREATE INDEX "moat_assessment_time_idx" ON "moat_assessments" USING btree ("instrument_id","calculated_at");--> statement-breakpoint
CREATE INDEX "operational_calendar_time_idx" ON "operational_calendar_snapshots" USING btree ("instrument_id","calculated_at");--> statement-breakpoint
CREATE INDEX "peer_comparison_time_idx" ON "peer_comparison_snapshots" USING btree ("instrument_id","calculated_at");--> statement-breakpoint
CREATE INDEX "peer_group_time_idx" ON "peer_groups" USING btree ("instrument_id","calculated_at");--> statement-breakpoint
CREATE INDEX "reverse_dcf_time_idx" ON "reverse_dcf_runs" USING btree ("instrument_id","calculated_at");--> statement-breakpoint
CREATE INDEX "risk_register_time_idx" ON "risk_register_items" USING btree ("instrument_id","calculated_at");--> statement-breakpoint
CREATE INDEX "company_horizon_time_idx" ON "time_horizon_assessments" USING btree ("instrument_id","horizon","calculated_at");--> statement-breakpoint
CREATE INDEX "valuation_snapshot_time_idx" ON "valuation_snapshots" USING btree ("instrument_id","calculated_at");