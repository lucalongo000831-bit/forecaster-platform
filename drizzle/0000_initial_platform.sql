CREATE TYPE "public"."alert_status" AS ENUM('ACTIVE', 'TRIGGERED', 'PAUSED', 'EXPIRED', 'DISABLED');--> statement-breakpoint
CREATE TYPE "public"."backtest_status" AS ENUM('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."data_freshness" AS ENUM('REALTIME', 'DELAYED', 'CACHED', 'MARKET_CLOSED', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."data_quality" AS ENUM('VERIFIED', 'PARTIAL', 'STALE', 'ESTIMATED', 'DEMO', 'UNAVAILABLE');--> statement-breakpoint
CREATE TYPE "public"."instrument_type" AS ENUM('EQUITY', 'ETF', 'FUND', 'INDEX', 'CRYPTO', 'FOREX', 'COMMODITY');--> statement-breakpoint
CREATE TYPE "public"."signal_category" AS ENUM('STRONG_SELL', 'SELL', 'HOLD', 'BUY', 'STRONG_BUY');--> statement-breakpoint
CREATE TYPE "public"."statement_period" AS ENUM('ANNUAL', 'QUARTERLY', 'TTM');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('BUY', 'SELL', 'DEPOSIT', 'WITHDRAWAL', 'DIVIDEND', 'FEE', 'SPLIT');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('USER', 'ADMIN');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" varchar(80) NOT NULL,
	"provider_account_id" varchar(220) NOT NULL,
	"type" varchar(40) DEFAULT 'credentials' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alert_id" uuid NOT NULL,
	"deduplication_key" varchar(180) NOT NULL,
	"payload" jsonb NOT NULL,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"instrument_id" uuid,
	"type" varchar(80) NOT NULL,
	"status" "alert_status" DEFAULT 'ACTIVE' NOT NULL,
	"configuration" jsonb NOT NULL,
	"last_evaluated_at" timestamp with time zone,
	"triggered_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analyst_estimates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"period_end" timestamp with time zone,
	"values" jsonb NOT NULL,
	"provider" varchar(40) NOT NULL,
	"provider_record_id" varchar(220),
	"source_timestamp" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"calculated_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"model_version" varchar(80),
	"data_quality" "data_quality" DEFAULT 'PARTIAL' NOT NULL,
	"freshness" "data_freshness" DEFAULT 'UNKNOWN' NOT NULL,
	"is_delayed" boolean DEFAULT false NOT NULL,
	"is_fallback" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analyst_price_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"period_end" timestamp with time zone,
	"values" jsonb NOT NULL,
	"provider" varchar(40) NOT NULL,
	"provider_record_id" varchar(220),
	"source_timestamp" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"calculated_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"model_version" varchar(80),
	"data_quality" "data_quality" DEFAULT 'PARTIAL' NOT NULL,
	"freshness" "data_freshness" DEFAULT 'UNKNOWN' NOT NULL,
	"is_delayed" boolean DEFAULT false NOT NULL,
	"is_fallback" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analyst_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"period_end" timestamp with time zone,
	"values" jsonb NOT NULL,
	"provider" varchar(40) NOT NULL,
	"provider_record_id" varchar(220),
	"source_timestamp" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"calculated_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"model_version" varchar(80),
	"data_quality" "data_quality" DEFAULT 'PARTIAL' NOT NULL,
	"freshness" "data_freshness" DEFAULT 'UNKNOWN' NOT NULL,
	"is_delayed" boolean DEFAULT false NOT NULL,
	"is_fallback" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backtest_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "backtest_status" DEFAULT 'QUEUED' NOT NULL,
	"configuration_hash" varchar(128) NOT NULL,
	"configuration" jsonb NOT NULL,
	"metrics" jsonb,
	"equity_curve" jsonb,
	"model_version" varchar(80) NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"runtime_ms" integer,
	"error_code" varchar(80),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backtest_trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"backtest_run_id" uuid NOT NULL,
	"instrument_id" uuid NOT NULL,
	"side" varchar(8) NOT NULL,
	"entry_at" timestamp with time zone NOT NULL,
	"exit_at" timestamp with time zone,
	"entry_price" numeric(30, 10) NOT NULL,
	"exit_price" numeric(30, 10),
	"quantity" numeric(30, 10) NOT NULL,
	"costs" numeric(30, 10) DEFAULT '0' NOT NULL,
	"pnl" numeric(30, 10),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "balance_sheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"period" "statement_period" NOT NULL,
	"fiscal_date" timestamp with time zone NOT NULL,
	"reported_currency" varchar(3),
	"values" jsonb NOT NULL,
	"filing_date" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"provider" varchar(40) NOT NULL,
	"provider_record_id" varchar(220),
	"source_timestamp" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"calculated_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"model_version" varchar(80),
	"data_quality" "data_quality" DEFAULT 'PARTIAL' NOT NULL,
	"freshness" "data_freshness" DEFAULT 'UNKNOWN' NOT NULL,
	"is_delayed" boolean DEFAULT false NOT NULL,
	"is_fallback" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calculation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_version_id" uuid,
	"instrument_id" uuid,
	"operation" varchar(100) NOT NULL,
	"input_hash" varchar(128) NOT NULL,
	"status" varchar(30) NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	"error_code" varchar(80),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_flow_statements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"period" "statement_period" NOT NULL,
	"fiscal_date" timestamp with time zone NOT NULL,
	"reported_currency" varchar(3),
	"values" jsonb NOT NULL,
	"filing_date" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"provider" varchar(40) NOT NULL,
	"provider_record_id" varchar(220),
	"source_timestamp" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"calculated_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"model_version" varchar(80),
	"data_quality" "data_quality" DEFAULT 'PARTIAL' NOT NULL,
	"freshness" "data_freshness" DEFAULT 'UNKNOWN' NOT NULL,
	"is_delayed" boolean DEFAULT false NOT NULL,
	"is_fallback" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"description" text,
	"website" text,
	"employees" integer,
	"ceo" varchar(180),
	"address" jsonb,
	"provider" varchar(40) NOT NULL,
	"provider_record_id" varchar(220),
	"source_timestamp" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"calculated_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"model_version" varchar(80),
	"data_quality" "data_quality" DEFAULT 'PARTIAL' NOT NULL,
	"freshness" "data_freshness" DEFAULT 'UNKNOWN' NOT NULL,
	"is_delayed" boolean DEFAULT false NOT NULL,
	"is_fallback" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corporate_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"action_type" varchar(40) NOT NULL,
	"ex_date" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL,
	"provider" varchar(40) NOT NULL,
	"provider_record_id" varchar(220),
	"source_timestamp" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"calculated_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"model_version" varchar(80),
	"data_quality" "data_quality" DEFAULT 'PARTIAL' NOT NULL,
	"freshness" "data_freshness" DEFAULT 'UNKNOWN' NOT NULL,
	"is_delayed" boolean DEFAULT false NOT NULL,
	"is_fallback" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dividends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"ex_date" timestamp with time zone NOT NULL,
	"payment_date" timestamp with time zone,
	"amount" numeric(30, 10) NOT NULL,
	"currency" varchar(3),
	"provider" varchar(40) NOT NULL,
	"provider_record_id" varchar(220),
	"source_timestamp" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"calculated_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"model_version" varchar(80),
	"data_quality" "data_quality" DEFAULT 'PARTIAL' NOT NULL,
	"freshness" "data_freshness" DEFAULT 'UNKNOWN' NOT NULL,
	"is_delayed" boolean DEFAULT false NOT NULL,
	"is_fallback" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchanges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mic" varchar(12) NOT NULL,
	"name" varchar(180) NOT NULL,
	"country_code" varchar(2),
	"timezone" varchar(80) NOT NULL,
	"currency" varchar(3),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forecast_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"horizon" varchar(32),
	"payload" jsonb NOT NULL,
	"input_timestamp" timestamp with time zone NOT NULL,
	"provider" varchar(40) NOT NULL,
	"provider_record_id" varchar(220),
	"source_timestamp" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"calculated_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"model_version" varchar(80),
	"data_quality" "data_quality" DEFAULT 'PARTIAL' NOT NULL,
	"freshness" "data_freshness" DEFAULT 'UNKNOWN' NOT NULL,
	"is_delayed" boolean DEFAULT false NOT NULL,
	"is_fallback" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fundamental_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"period" "statement_period" NOT NULL,
	"fiscal_date" timestamp with time zone NOT NULL,
	"values" jsonb NOT NULL,
	"provider" varchar(40) NOT NULL,
	"provider_record_id" varchar(220),
	"source_timestamp" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"calculated_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"model_version" varchar(80),
	"data_quality" "data_quality" DEFAULT 'PARTIAL' NOT NULL,
	"freshness" "data_freshness" DEFAULT 'UNKNOWN' NOT NULL,
	"is_delayed" boolean DEFAULT false NOT NULL,
	"is_fallback" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "income_statements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"period" "statement_period" NOT NULL,
	"fiscal_date" timestamp with time zone NOT NULL,
	"reported_currency" varchar(3),
	"values" jsonb NOT NULL,
	"filing_date" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"provider" varchar(40) NOT NULL,
	"provider_record_id" varchar(220),
	"source_timestamp" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"calculated_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"model_version" varchar(80),
	"data_quality" "data_quality" DEFAULT 'PARTIAL' NOT NULL,
	"freshness" "data_freshness" DEFAULT 'UNKNOWN' NOT NULL,
	"is_delayed" boolean DEFAULT false NOT NULL,
	"is_fallback" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instrument_symbols" (
	"instrument_id" uuid NOT NULL,
	"provider" varchar(40) NOT NULL,
	"symbol" varchar(100) NOT NULL,
	"exchange_code" varchar(40),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instrument_symbols_instrument_id_provider_pk" PRIMARY KEY("instrument_id","provider")
);
--> statement-breakpoint
CREATE TABLE "instruments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exchange_id" uuid,
	"canonical_symbol" varchar(64) NOT NULL,
	"name" varchar(300) NOT NULL,
	"slug" varchar(180) NOT NULL,
	"type" "instrument_type" NOT NULL,
	"currency" varchar(3),
	"market" varchar(80),
	"country_code" varchar(2),
	"sector" varchar(160),
	"industry" varchar(180),
	"active" boolean DEFAULT true NOT NULL,
	"delisted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "macro_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" varchar(80) NOT NULL,
	"title" text NOT NULL,
	"country_code" varchar(2),
	"currency" varchar(3),
	"starts_at" timestamp with time zone NOT NULL,
	"actual" numeric(30, 10),
	"estimate" numeric(30, 10),
	"previous" numeric(30, 10),
	"provider" varchar(40) NOT NULL,
	"provider_record_id" varchar(220),
	"source_timestamp" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"calculated_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"model_version" varchar(80),
	"data_quality" "data_quality" DEFAULT 'PARTIAL' NOT NULL,
	"freshness" "data_freshness" DEFAULT 'UNKNOWN' NOT NULL,
	"is_delayed" boolean DEFAULT false NOT NULL,
	"is_fallback" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"version" varchar(80) NOT NULL,
	"configuration" jsonb NOT NULL,
	"checksum" varchar(128) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"news_item_id" uuid NOT NULL,
	"entity_type" varchar(40) NOT NULL,
	"value" varchar(300) NOT NULL,
	"confidence" numeric(8, 6)
);
--> statement-breakpoint
CREATE TABLE "news_instrument_relations" (
	"news_item_id" uuid NOT NULL,
	"instrument_id" uuid NOT NULL,
	"relevance" numeric(8, 6),
	"expected_direction" varchar(20),
	CONSTRAINT "news_instrument_relations_news_item_id_instrument_id_pk" PRIMARY KEY("news_item_id","instrument_id")
);
--> statement-breakpoint
CREATE TABLE "news_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_url" text NOT NULL,
	"normalized_title" text NOT NULL,
	"title" text NOT NULL,
	"publisher" varchar(200),
	"published_at" timestamp with time zone NOT NULL,
	"summary" text,
	"sentiment" numeric(8, 6),
	"relevance" numeric(8, 6),
	"classification" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"provider" varchar(40) NOT NULL,
	"provider_record_id" varchar(220),
	"source_timestamp" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"calculated_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"model_version" varchar(80),
	"data_quality" "data_quality" DEFAULT 'PARTIAL' NOT NULL,
	"freshness" "data_freshness" DEFAULT 'UNKNOWN' NOT NULL,
	"is_delayed" boolean DEFAULT false NOT NULL,
	"is_fallback" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_positions" (
	"portfolio_id" uuid NOT NULL,
	"instrument_id" uuid NOT NULL,
	"quantity" numeric(30, 10) NOT NULL,
	"average_price" numeric(30, 10) NOT NULL,
	"realized_pnl" numeric(30, 10) DEFAULT '0' NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portfolio_positions_portfolio_id_instrument_id_pk" PRIMARY KEY("portfolio_id","instrument_id")
);
--> statement-breakpoint
CREATE TABLE "portfolio_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"instrument_id" uuid,
	"type" "transaction_type" NOT NULL,
	"executed_at" timestamp with time zone NOT NULL,
	"quantity" numeric(30, 10),
	"price" numeric(30, 10),
	"fees" numeric(30, 10) DEFAULT '0' NOT NULL,
	"currency" varchar(3) NOT NULL,
	"external_id" varchar(180),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"base_currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_bars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"interval" varchar(12) NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"open" numeric(30, 10) NOT NULL,
	"high" numeric(30, 10) NOT NULL,
	"low" numeric(30, 10) NOT NULL,
	"close" numeric(30, 10) NOT NULL,
	"adjusted_close" numeric(30, 10),
	"volume" numeric(30, 4),
	"provider" varchar(40) NOT NULL,
	"provider_record_id" varchar(220),
	"source_timestamp" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"calculated_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"model_version" varchar(80),
	"data_quality" "data_quality" DEFAULT 'PARTIAL' NOT NULL,
	"freshness" "data_freshness" DEFAULT 'UNKNOWN' NOT NULL,
	"is_delayed" boolean DEFAULT false NOT NULL,
	"is_fallback" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_health_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(40) NOT NULL,
	"status" varchar(30) NOT NULL,
	"latency_ms" integer,
	"error_code" varchar(80),
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_request_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(40) NOT NULL,
	"operation" varchar(100) NOT NULL,
	"request_id" uuid,
	"status" varchar(30) NOT NULL,
	"error_code" varchar(80),
	"latency_ms" integer NOT NULL,
	"cache_status" varchar(20),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"price" numeric(30, 10) NOT NULL,
	"change" numeric(30, 10),
	"change_percent" numeric(18, 8),
	"open" numeric(30, 10),
	"high" numeric(30, 10),
	"low" numeric(30, 10),
	"previous_close" numeric(30, 10),
	"volume" numeric(30, 4),
	"market_cap" numeric(38, 4),
	"currency" varchar(3),
	"provider" varchar(40) NOT NULL,
	"provider_record_id" varchar(220),
	"source_timestamp" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"calculated_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"model_version" varchar(80),
	"data_quality" "data_quality" DEFAULT 'PARTIAL' NOT NULL,
	"freshness" "data_freshness" DEFAULT 'UNKNOWN' NOT NULL,
	"is_delayed" boolean DEFAULT false NOT NULL,
	"is_fallback" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_plan_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"horizon" varchar(32),
	"payload" jsonb NOT NULL,
	"input_timestamp" timestamp with time zone NOT NULL,
	"provider" varchar(40) NOT NULL,
	"provider_record_id" varchar(220),
	"source_timestamp" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"calculated_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"model_version" varchar(80),
	"data_quality" "data_quality" DEFAULT 'PARTIAL' NOT NULL,
	"freshness" "data_freshness" DEFAULT 'UNKNOWN' NOT NULL,
	"is_delayed" boolean DEFAULT false NOT NULL,
	"is_fallback" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seasonality_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"horizon" varchar(32),
	"payload" jsonb NOT NULL,
	"input_timestamp" timestamp with time zone NOT NULL,
	"provider" varchar(40) NOT NULL,
	"provider_record_id" varchar(220),
	"source_timestamp" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"calculated_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"model_version" varchar(80),
	"data_quality" "data_quality" DEFAULT 'PARTIAL' NOT NULL,
	"freshness" "data_freshness" DEFAULT 'UNKNOWN' NOT NULL,
	"is_delayed" boolean DEFAULT false NOT NULL,
	"is_fallback" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" varchar(300),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signal_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"horizon" varchar(32),
	"payload" jsonb NOT NULL,
	"input_timestamp" timestamp with time zone NOT NULL,
	"provider" varchar(40) NOT NULL,
	"provider_record_id" varchar(220),
	"source_timestamp" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"calculated_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"model_version" varchar(80),
	"data_quality" "data_quality" DEFAULT 'PARTIAL' NOT NULL,
	"freshness" "data_freshness" DEFAULT 'UNKNOWN' NOT NULL,
	"is_delayed" boolean DEFAULT false NOT NULL,
	"is_fallback" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"signal" "signal_category" NOT NULL,
	"score" numeric(8, 4) NOT NULL,
	"confidence" numeric(8, 6) NOT NULL,
	"sample_size" integer
);
--> statement-breakpoint
CREATE TABLE "splits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"execution_date" timestamp with time zone NOT NULL,
	"from_factor" numeric(20, 8) NOT NULL,
	"to_factor" numeric(20, 8) NOT NULL,
	"provider" varchar(40) NOT NULL,
	"provider_record_id" varchar(220),
	"source_timestamp" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"calculated_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"model_version" varchar(80),
	"data_quality" "data_quality" DEFAULT 'PARTIAL' NOT NULL,
	"freshness" "data_freshness" DEFAULT 'UNKNOWN' NOT NULL,
	"is_delayed" boolean DEFAULT false NOT NULL,
	"is_fallback" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "target_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"horizon" varchar(32),
	"payload" jsonb NOT NULL,
	"input_timestamp" timestamp with time zone NOT NULL,
	"provider" varchar(40) NOT NULL,
	"provider_record_id" varchar(220),
	"source_timestamp" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"calculated_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"model_version" varchar(80),
	"data_quality" "data_quality" DEFAULT 'PARTIAL' NOT NULL,
	"freshness" "data_freshness" DEFAULT 'UNKNOWN' NOT NULL,
	"is_delayed" boolean DEFAULT false NOT NULL,
	"is_fallback" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "technical_indicator_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"horizon" varchar(32),
	"payload" jsonb NOT NULL,
	"input_timestamp" timestamp with time zone NOT NULL,
	"provider" varchar(40) NOT NULL,
	"provider_record_id" varchar(220),
	"source_timestamp" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"calculated_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"model_version" varchar(80),
	"data_quality" "data_quality" DEFAULT 'PARTIAL' NOT NULL,
	"freshness" "data_freshness" DEFAULT 'UNKNOWN' NOT NULL,
	"is_delayed" boolean DEFAULT false NOT NULL,
	"is_fallback" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"name" varchar(160),
	"password_hash" text,
	"email_verified_at" timestamp with time zone,
	"role" "user_role" DEFAULT 'USER' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watchlist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"watchlist_id" uuid NOT NULL,
	"instrument_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watchlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analyst_estimates" ADD CONSTRAINT "analyst_estimates_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analyst_price_targets" ADD CONSTRAINT "analyst_price_targets_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analyst_ratings" ADD CONSTRAINT "analyst_ratings_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backtest_runs" ADD CONSTRAINT "backtest_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backtest_trades" ADD CONSTRAINT "backtest_trades_backtest_run_id_backtest_runs_id_fk" FOREIGN KEY ("backtest_run_id") REFERENCES "public"."backtest_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backtest_trades" ADD CONSTRAINT "backtest_trades_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "balance_sheets" ADD CONSTRAINT "balance_sheets_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculation_runs" ADD CONSTRAINT "calculation_runs_model_version_id_model_versions_id_fk" FOREIGN KEY ("model_version_id") REFERENCES "public"."model_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculation_runs" ADD CONSTRAINT "calculation_runs_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_flow_statements" ADD CONSTRAINT "cash_flow_statements_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_profiles" ADD CONSTRAINT "company_profiles_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_actions" ADD CONSTRAINT "corporate_actions_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dividends" ADD CONSTRAINT "dividends_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecast_snapshots" ADD CONSTRAINT "forecast_snapshots_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fundamental_metrics" ADD CONSTRAINT "fundamental_metrics_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_statements" ADD CONSTRAINT "income_statements_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instrument_symbols" ADD CONSTRAINT "instrument_symbols_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instruments" ADD CONSTRAINT "instruments_exchange_id_exchanges_id_fk" FOREIGN KEY ("exchange_id") REFERENCES "public"."exchanges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_entities" ADD CONSTRAINT "news_entities_news_item_id_news_items_id_fk" FOREIGN KEY ("news_item_id") REFERENCES "public"."news_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_instrument_relations" ADD CONSTRAINT "news_instrument_relations_news_item_id_news_items_id_fk" FOREIGN KEY ("news_item_id") REFERENCES "public"."news_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_instrument_relations" ADD CONSTRAINT "news_instrument_relations_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_positions" ADD CONSTRAINT "portfolio_positions_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_positions" ADD CONSTRAINT "portfolio_positions_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_transactions" ADD CONSTRAINT "portfolio_transactions_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_transactions" ADD CONSTRAINT "portfolio_transactions_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_bars" ADD CONSTRAINT "price_bars_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_snapshots" ADD CONSTRAINT "quote_snapshots_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_plan_snapshots" ADD CONSTRAINT "risk_plan_snapshots_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasonality_snapshots" ADD CONSTRAINT "seasonality_snapshots_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_snapshots" ADD CONSTRAINT "signal_snapshots_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "splits" ADD CONSTRAINT "splits_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "target_snapshots" ADD CONSTRAINT "target_snapshots_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_indicator_snapshots" ADD CONSTRAINT "technical_indicator_snapshots_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_watchlist_id_watchlists_id_fk" FOREIGN KEY ("watchlist_id") REFERENCES "public"."watchlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlists" ADD CONSTRAINT "watchlists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_provider_unique" ON "accounts" USING btree ("provider","provider_account_id");--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "alert_event_dedupe_unique" ON "alert_events" USING btree ("alert_id","deduplication_key");--> statement-breakpoint
CREATE INDEX "alert_evaluation_idx" ON "alerts" USING btree ("status","last_evaluated_at");--> statement-breakpoint
CREATE INDEX "alert_user_idx" ON "alerts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "analyst_estimate_idx" ON "analyst_estimates" USING btree ("instrument_id","period_end");--> statement-breakpoint
CREATE INDEX "analyst_target_idx" ON "analyst_price_targets" USING btree ("instrument_id","source_timestamp");--> statement-breakpoint
CREATE INDEX "analyst_rating_idx" ON "analyst_ratings" USING btree ("instrument_id","source_timestamp");--> statement-breakpoint
CREATE INDEX "backtest_user_created_idx" ON "backtest_runs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "backtest_status_idx" ON "backtest_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "backtest_trade_run_time_idx" ON "backtest_trades" USING btree ("backtest_run_id","entry_at");--> statement-breakpoint
CREATE UNIQUE INDEX "balance_sheet_unique" ON "balance_sheets" USING btree ("instrument_id","period","fiscal_date","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "calculation_input_unique" ON "calculation_runs" USING btree ("operation","input_hash");--> statement-breakpoint
CREATE INDEX "calculation_status_idx" ON "calculation_runs" USING btree ("status","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cash_flow_statement_unique" ON "cash_flow_statements" USING btree ("instrument_id","period","fiscal_date","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "company_profile_provider_unique" ON "company_profiles" USING btree ("instrument_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "corporate_action_dedupe_unique" ON "corporate_actions" USING btree ("instrument_id","action_type","ex_date","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "dividend_dedupe_unique" ON "dividends" USING btree ("instrument_id","ex_date","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "exchanges_mic_unique" ON "exchanges" USING btree ("mic");--> statement-breakpoint
CREATE INDEX "forecast_snapshot_idx" ON "forecast_snapshots" USING btree ("instrument_id","horizon","calculated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "fundamental_metric_unique" ON "fundamental_metrics" USING btree ("instrument_id","period","fiscal_date","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "income_statement_unique" ON "income_statements" USING btree ("instrument_id","period","fiscal_date","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "instrument_provider_symbol_unique" ON "instrument_symbols" USING btree ("provider","symbol","exchange_code");--> statement-breakpoint
CREATE UNIQUE INDEX "instruments_slug_unique" ON "instruments" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "instruments_symbol_exchange_unique" ON "instruments" USING btree ("canonical_symbol","exchange_id");--> statement-breakpoint
CREATE INDEX "instruments_search_idx" ON "instruments" USING btree ("canonical_symbol","name");--> statement-breakpoint
CREATE INDEX "instruments_type_idx" ON "instruments" USING btree ("type","active");--> statement-breakpoint
CREATE INDEX "macro_event_time_idx" ON "macro_events" USING btree ("starts_at","country_code");--> statement-breakpoint
CREATE UNIQUE INDEX "model_name_version_unique" ON "model_versions" USING btree ("name","version");--> statement-breakpoint
CREATE INDEX "news_entity_lookup_idx" ON "news_entities" USING btree ("entity_type","value");--> statement-breakpoint
CREATE INDEX "news_instrument_idx" ON "news_instrument_relations" USING btree ("instrument_id","news_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "news_url_unique" ON "news_items" USING btree ("canonical_url");--> statement-breakpoint
CREATE INDEX "news_published_idx" ON "news_items" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "portfolio_transaction_time_idx" ON "portfolio_transactions" USING btree ("portfolio_id","executed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "portfolio_external_transaction_unique" ON "portfolio_transactions" USING btree ("portfolio_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portfolio_user_name_unique" ON "portfolios" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "portfolio_user_idx" ON "portfolios" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bars_instrument_interval_time_provider_unique" ON "price_bars" USING btree ("instrument_id","interval","timestamp","provider");--> statement-breakpoint
CREATE INDEX "bars_query_idx" ON "price_bars" USING btree ("instrument_id","interval","timestamp");--> statement-breakpoint
CREATE INDEX "provider_health_time_idx" ON "provider_health_snapshots" USING btree ("provider","checked_at");--> statement-breakpoint
CREATE INDEX "provider_log_time_idx" ON "provider_request_logs" USING btree ("provider","created_at");--> statement-breakpoint
CREATE INDEX "provider_log_error_idx" ON "provider_request_logs" USING btree ("error_code","created_at");--> statement-breakpoint
CREATE INDEX "quote_instrument_time_idx" ON "quote_snapshots" USING btree ("instrument_id","source_timestamp");--> statement-breakpoint
CREATE INDEX "risk_snapshot_idx" ON "risk_plan_snapshots" USING btree ("instrument_id","horizon","calculated_at");--> statement-breakpoint
CREATE INDEX "seasonality_snapshot_idx" ON "seasonality_snapshots" USING btree ("instrument_id","horizon","calculated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_unique" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_expiry_idx" ON "sessions" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE INDEX "signal_snapshot_idx" ON "signal_snapshots" USING btree ("instrument_id","horizon","calculated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "split_dedupe_unique" ON "splits" USING btree ("instrument_id","execution_date","provider");--> statement-breakpoint
CREATE INDEX "target_snapshot_idx" ON "target_snapshots" USING btree ("instrument_id","horizon","calculated_at");--> statement-breakpoint
CREATE INDEX "technical_snapshot_idx" ON "technical_indicator_snapshots" USING btree ("instrument_id","horizon","calculated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "watchlist_item_unique" ON "watchlist_items" USING btree ("watchlist_id","instrument_id");--> statement-breakpoint
CREATE INDEX "watchlist_item_order_idx" ON "watchlist_items" USING btree ("watchlist_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "watchlist_user_name_unique" ON "watchlists" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "watchlist_user_idx" ON "watchlists" USING btree ("user_id");