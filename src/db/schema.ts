import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["USER", "ADMIN"]);
export const instrumentType = pgEnum("instrument_type", ["EQUITY", "ETF", "FUND", "INDEX", "CRYPTO", "FOREX", "COMMODITY"]);
export const dataQuality = pgEnum("data_quality", ["VERIFIED", "PARTIAL", "STALE", "ESTIMATED", "DEMO", "UNAVAILABLE"]);
export const dataFreshness = pgEnum("data_freshness", ["REALTIME", "DELAYED", "CACHED", "MARKET_CLOSED", "UNKNOWN"]);
export const statementPeriod = pgEnum("statement_period", ["ANNUAL", "QUARTERLY", "TTM"]);
export const signalCategory = pgEnum("signal_category", ["STRONG_SELL", "SELL", "HOLD", "BUY", "STRONG_BUY"]);
export const alertStatus = pgEnum("alert_status", ["ACTIVE", "TRIGGERED", "PAUSED", "EXPIRED", "DISABLED"]);
export const backtestStatus = pgEnum("backtest_status", ["QUEUED", "RUNNING", "COMPLETED", "FAILED"]);
export const transactionType = pgEnum("transaction_type", ["BUY", "SELL", "DEPOSIT", "WITHDRAWAL", "DIVIDEND", "FEE", "SPLIT"]);

const createdUpdated = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

const provenance = () => ({
  provider: varchar("provider", { length: 40 }).notNull(),
  providerRecordId: varchar("provider_record_id", { length: 220 }),
  sourceTimestamp: timestamp("source_timestamp", { withTimezone: true }),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
  calculatedAt: timestamp("calculated_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  modelVersion: varchar("model_version", { length: 80 }),
  quality: dataQuality("data_quality").default("PARTIAL").notNull(),
  freshness: dataFreshness("freshness").default("UNKNOWN").notNull(),
  isDelayed: boolean("is_delayed").default(false).notNull(),
  isFallback: boolean("is_fallback").default(false).notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
});

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  name: varchar("name", { length: 160 }),
  passwordHash: text("password_hash"),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  role: userRole("role").default("USER").notNull(),
  ...createdUpdated(),
}, (table) => [uniqueIndex("users_email_unique").on(table.email)]);

export const accounts = pgTable("accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  provider: varchar("provider", { length: 80 }).notNull(),
  providerAccountId: varchar("provider_account_id", { length: 220 }).notNull(),
  type: varchar("type", { length: 40 }).default("credentials").notNull(),
  ...createdUpdated(),
}, (table) => [uniqueIndex("accounts_provider_unique").on(table.provider, table.providerAccountId), index("accounts_user_idx").on(table.userId)]);

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  tokenHash: varchar("token_hash", { length: 128 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  userAgent: varchar("user_agent", { length: 300 }),
  ...createdUpdated(),
}, (table) => [uniqueIndex("sessions_token_hash_unique").on(table.tokenHash), index("sessions_user_expiry_idx").on(table.userId, table.expiresAt)]);

export const exchanges = pgTable("exchanges", {
  id: uuid("id").defaultRandom().primaryKey(),
  mic: varchar("mic", { length: 12 }).notNull(),
  name: varchar("name", { length: 180 }).notNull(),
  countryCode: varchar("country_code", { length: 2 }),
  timezone: varchar("timezone", { length: 80 }).notNull(),
  currency: varchar("currency", { length: 3 }),
  ...createdUpdated(),
}, (table) => [uniqueIndex("exchanges_mic_unique").on(table.mic)]);

export const instruments = pgTable("instruments", {
  id: uuid("id").defaultRandom().primaryKey(),
  exchangeId: uuid("exchange_id").references(() => exchanges.id),
  canonicalSymbol: varchar("canonical_symbol", { length: 64 }).notNull(),
  name: varchar("name", { length: 300 }).notNull(),
  slug: varchar("slug", { length: 180 }).notNull(),
  type: instrumentType("type").notNull(),
  currency: varchar("currency", { length: 3 }),
  market: varchar("market", { length: 80 }),
  countryCode: varchar("country_code", { length: 2 }),
  sector: varchar("sector", { length: 160 }),
  industry: varchar("industry", { length: 180 }),
  active: boolean("active").default(true).notNull(),
  delistedAt: timestamp("delisted_at", { withTimezone: true }),
  ...createdUpdated(),
}, (table) => [
  uniqueIndex("instruments_slug_unique").on(table.slug),
  uniqueIndex("instruments_symbol_exchange_unique").on(table.canonicalSymbol, table.exchangeId),
  index("instruments_search_idx").on(table.canonicalSymbol, table.name),
  index("instruments_type_idx").on(table.type, table.active),
]);

export const instrumentSymbols = pgTable("instrument_symbols", {
  instrumentId: uuid("instrument_id").references(() => instruments.id, { onDelete: "cascade" }).notNull(),
  provider: varchar("provider", { length: 40 }).notNull(),
  symbol: varchar("symbol", { length: 100 }).notNull(),
  exchangeCode: varchar("exchange_code", { length: 40 }),
  ...createdUpdated(),
}, (table) => [primaryKey({ columns: [table.instrumentId, table.provider] }), uniqueIndex("instrument_provider_symbol_unique").on(table.provider, table.symbol, table.exchangeCode)]);

export const quoteSnapshots = pgTable("quote_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  instrumentId: uuid("instrument_id").references(() => instruments.id, { onDelete: "cascade" }).notNull(),
  price: numeric("price", { precision: 30, scale: 10 }).notNull(),
  change: numeric("change", { precision: 30, scale: 10 }),
  changePercent: numeric("change_percent", { precision: 18, scale: 8 }),
  open: numeric("open", { precision: 30, scale: 10 }),
  high: numeric("high", { precision: 30, scale: 10 }),
  low: numeric("low", { precision: 30, scale: 10 }),
  previousClose: numeric("previous_close", { precision: 30, scale: 10 }),
  volume: numeric("volume", { precision: 30, scale: 4 }),
  marketCap: numeric("market_cap", { precision: 38, scale: 4 }),
  currency: varchar("currency", { length: 3 }),
  ...provenance(),
  ...createdUpdated(),
}, (table) => [index("quote_instrument_time_idx").on(table.instrumentId, table.sourceTimestamp)]);

export const priceBars = pgTable("price_bars", {
  id: uuid("id").defaultRandom().primaryKey(),
  instrumentId: uuid("instrument_id").references(() => instruments.id, { onDelete: "cascade" }).notNull(),
  interval: varchar("interval", { length: 12 }).notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  open: numeric("open", { precision: 30, scale: 10 }).notNull(),
  high: numeric("high", { precision: 30, scale: 10 }).notNull(),
  low: numeric("low", { precision: 30, scale: 10 }).notNull(),
  close: numeric("close", { precision: 30, scale: 10 }).notNull(),
  adjustedClose: numeric("adjusted_close", { precision: 30, scale: 10 }),
  volume: numeric("volume", { precision: 30, scale: 4 }),
  ...provenance(),
  ...createdUpdated(),
}, (table) => [uniqueIndex("bars_instrument_interval_time_provider_unique").on(table.instrumentId, table.interval, table.timestamp, table.provider), index("bars_query_idx").on(table.instrumentId, table.interval, table.timestamp)]);

export const corporateActions = pgTable("corporate_actions", {
  id: uuid("id").defaultRandom().primaryKey(),
  instrumentId: uuid("instrument_id").references(() => instruments.id, { onDelete: "cascade" }).notNull(),
  actionType: varchar("action_type", { length: 40 }).notNull(),
  exDate: timestamp("ex_date", { withTimezone: true }).notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  ...provenance(),
  ...createdUpdated(),
}, (table) => [uniqueIndex("corporate_action_dedupe_unique").on(table.instrumentId, table.actionType, table.exDate, table.provider)]);

export const dividends = pgTable("dividends", {
  id: uuid("id").defaultRandom().primaryKey(),
  instrumentId: uuid("instrument_id").references(() => instruments.id, { onDelete: "cascade" }).notNull(),
  exDate: timestamp("ex_date", { withTimezone: true }).notNull(),
  paymentDate: timestamp("payment_date", { withTimezone: true }),
  amount: numeric("amount", { precision: 30, scale: 10 }).notNull(),
  currency: varchar("currency", { length: 3 }),
  ...provenance(),
  ...createdUpdated(),
}, (table) => [uniqueIndex("dividend_dedupe_unique").on(table.instrumentId, table.exDate, table.provider)]);

export const splits = pgTable("splits", {
  id: uuid("id").defaultRandom().primaryKey(),
  instrumentId: uuid("instrument_id").references(() => instruments.id, { onDelete: "cascade" }).notNull(),
  executionDate: timestamp("execution_date", { withTimezone: true }).notNull(),
  fromFactor: numeric("from_factor", { precision: 20, scale: 8 }).notNull(),
  toFactor: numeric("to_factor", { precision: 20, scale: 8 }).notNull(),
  ...provenance(),
  ...createdUpdated(),
}, (table) => [uniqueIndex("split_dedupe_unique").on(table.instrumentId, table.executionDate, table.provider)]);

export const companyProfiles = pgTable("company_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  instrumentId: uuid("instrument_id").references(() => instruments.id, { onDelete: "cascade" }).notNull(),
  description: text("description"),
  website: text("website"),
  employees: integer("employees"),
  ceo: varchar("ceo", { length: 180 }),
  address: jsonb("address").$type<Record<string, unknown>>(),
  ...provenance(),
  ...createdUpdated(),
}, (table) => [uniqueIndex("company_profile_provider_unique").on(table.instrumentId, table.provider)]);

const statementColumns = () => ({
  id: uuid("id").defaultRandom().primaryKey(),
  instrumentId: uuid("instrument_id").references(() => instruments.id, { onDelete: "cascade" }).notNull(),
  period: statementPeriod("period").notNull(),
  fiscalDate: timestamp("fiscal_date", { withTimezone: true }).notNull(),
  reportedCurrency: varchar("reported_currency", { length: 3 }),
  values: jsonb("values").$type<Record<string, string | null>>().notNull(),
  filingDate: timestamp("filing_date", { withTimezone: true }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  ...provenance(),
  ...createdUpdated(),
});

export const incomeStatements = pgTable("income_statements", statementColumns(), (table) => [uniqueIndex("income_statement_unique").on(table.instrumentId, table.period, table.fiscalDate, table.provider)]);
export const balanceSheets = pgTable("balance_sheets", statementColumns(), (table) => [uniqueIndex("balance_sheet_unique").on(table.instrumentId, table.period, table.fiscalDate, table.provider)]);
export const cashFlowStatements = pgTable("cash_flow_statements", statementColumns(), (table) => [uniqueIndex("cash_flow_statement_unique").on(table.instrumentId, table.period, table.fiscalDate, table.provider)]);

export const fundamentalMetrics = pgTable("fundamental_metrics", {
  id: uuid("id").defaultRandom().primaryKey(),
  instrumentId: uuid("instrument_id").references(() => instruments.id, { onDelete: "cascade" }).notNull(),
  period: statementPeriod("period").notNull(),
  fiscalDate: timestamp("fiscal_date", { withTimezone: true }).notNull(),
  values: jsonb("values").$type<Record<string, number | null>>().notNull(),
  ...provenance(),
  ...createdUpdated(),
}, (table) => [uniqueIndex("fundamental_metric_unique").on(table.instrumentId, table.period, table.fiscalDate, table.provider)]);

const analystColumns = () => ({
  id: uuid("id").defaultRandom().primaryKey(),
  instrumentId: uuid("instrument_id").references(() => instruments.id, { onDelete: "cascade" }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }),
  values: jsonb("values").$type<Record<string, number | string | null>>().notNull(),
  ...provenance(),
  ...createdUpdated(),
});

export const analystEstimates = pgTable("analyst_estimates", analystColumns(), (table) => [index("analyst_estimate_idx").on(table.instrumentId, table.periodEnd)]);
export const analystRatings = pgTable("analyst_ratings", analystColumns(), (table) => [index("analyst_rating_idx").on(table.instrumentId, table.sourceTimestamp)]);
export const analystPriceTargets = pgTable("analyst_price_targets", analystColumns(), (table) => [index("analyst_target_idx").on(table.instrumentId, table.sourceTimestamp)]);

export const newsItems = pgTable("news_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  canonicalUrl: text("canonical_url").notNull(),
  normalizedTitle: text("normalized_title").notNull(),
  title: text("title").notNull(),
  publisher: varchar("publisher", { length: 200 }),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
  summary: text("summary"),
  sentiment: numeric("sentiment", { precision: 8, scale: 6 }),
  relevance: numeric("relevance", { precision: 8, scale: 6 }),
  classification: jsonb("classification").$type<Record<string, unknown>>().default({}).notNull(),
  ...provenance(),
  ...createdUpdated(),
}, (table) => [uniqueIndex("news_url_unique").on(table.canonicalUrl), index("news_published_idx").on(table.publishedAt)]);

export const newsEntities = pgTable("news_entities", {
  id: uuid("id").defaultRandom().primaryKey(),
  newsItemId: uuid("news_item_id").references(() => newsItems.id, { onDelete: "cascade" }).notNull(),
  entityType: varchar("entity_type", { length: 40 }).notNull(),
  value: varchar("value", { length: 300 }).notNull(),
  confidence: numeric("confidence", { precision: 8, scale: 6 }),
}, (table) => [index("news_entity_lookup_idx").on(table.entityType, table.value)]);

export const newsInstrumentRelations = pgTable("news_instrument_relations", {
  newsItemId: uuid("news_item_id").references(() => newsItems.id, { onDelete: "cascade" }).notNull(),
  instrumentId: uuid("instrument_id").references(() => instruments.id, { onDelete: "cascade" }).notNull(),
  relevance: numeric("relevance", { precision: 8, scale: 6 }),
  expectedDirection: varchar("expected_direction", { length: 20 }),
}, (table) => [primaryKey({ columns: [table.newsItemId, table.instrumentId] }), index("news_instrument_idx").on(table.instrumentId, table.newsItemId)]);

export const macroEvents = pgTable("macro_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventType: varchar("event_type", { length: 80 }).notNull(),
  title: text("title").notNull(),
  countryCode: varchar("country_code", { length: 2 }),
  currency: varchar("currency", { length: 3 }),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  actual: numeric("actual", { precision: 30, scale: 10 }),
  estimate: numeric("estimate", { precision: 30, scale: 10 }),
  previous: numeric("previous", { precision: 30, scale: 10 }),
  ...provenance(),
  ...createdUpdated(),
}, (table) => [index("macro_event_time_idx").on(table.startsAt, table.countryCode)]);

export const calendarEvents = pgTable("calendar_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventType: varchar("event_type", { length: 40 }).notNull(),
  symbol: varchar("symbol", { length: 64 }),
  title: text("title").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
  provider: varchar("provider", { length: 40 }).notNull(),
  providerRecordId: varchar("provider_record_id", { length: 220 }).notNull(),
  sourceTimestamp: timestamp("source_timestamp", { withTimezone: true }),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
  quality: dataQuality("data_quality").default("PARTIAL").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  ...createdUpdated(),
}, (table) => [uniqueIndex("calendar_provider_record_unique").on(table.provider, table.providerRecordId), index("calendar_event_time_idx").on(table.startsAt, table.eventType), index("calendar_event_symbol_idx").on(table.symbol, table.startsAt)]);

export const modelVersions = pgTable("model_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  version: varchar("version", { length: 80 }).notNull(),
  configuration: jsonb("configuration").$type<Record<string, unknown>>().notNull(),
  checksum: varchar("checksum", { length: 128 }).notNull(),
  active: boolean("active").default(true).notNull(),
  ...createdUpdated(),
}, (table) => [uniqueIndex("model_name_version_unique").on(table.name, table.version)]);

const snapshotColumns = () => ({
  id: uuid("id").defaultRandom().primaryKey(),
  instrumentId: uuid("instrument_id").references(() => instruments.id, { onDelete: "cascade" }).notNull(),
  horizon: varchar("horizon", { length: 32 }),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  inputTimestamp: timestamp("input_timestamp", { withTimezone: true }).notNull(),
  ...provenance(),
  ...createdUpdated(),
});

export const technicalIndicatorSnapshots = pgTable("technical_indicator_snapshots", snapshotColumns(), (table) => [index("technical_snapshot_idx").on(table.instrumentId, table.horizon, table.calculatedAt)]);
export const seasonalitySnapshots = pgTable("seasonality_snapshots", snapshotColumns(), (table) => [index("seasonality_snapshot_idx").on(table.instrumentId, table.horizon, table.calculatedAt)]);
export const forecastSnapshots = pgTable("forecast_snapshots", snapshotColumns(), (table) => [index("forecast_snapshot_idx").on(table.instrumentId, table.horizon, table.calculatedAt)]);
export const targetSnapshots = pgTable("target_snapshots", snapshotColumns(), (table) => [index("target_snapshot_idx").on(table.instrumentId, table.horizon, table.calculatedAt)]);
export const riskPlanSnapshots = pgTable("risk_plan_snapshots", snapshotColumns(), (table) => [index("risk_snapshot_idx").on(table.instrumentId, table.horizon, table.calculatedAt)]);

export const signalSnapshots = pgTable("signal_snapshots", {
  ...snapshotColumns(),
  signal: signalCategory("signal").notNull(),
  score: numeric("score", { precision: 8, scale: 4 }).notNull(),
  confidence: numeric("confidence", { precision: 8, scale: 6 }).notNull(),
  sampleSize: integer("sample_size"),
}, (table) => [index("signal_snapshot_idx").on(table.instrumentId, table.horizon, table.calculatedAt)]);

export const calculationRuns = pgTable("calculation_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  modelVersionId: uuid("model_version_id").references(() => modelVersions.id),
  instrumentId: uuid("instrument_id").references(() => instruments.id),
  operation: varchar("operation", { length: 100 }).notNull(),
  inputHash: varchar("input_hash", { length: 128 }).notNull(),
  status: varchar("status", { length: 30 }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  durationMs: integer("duration_ms"),
  errorCode: varchar("error_code", { length: 80 }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
}, (table) => [uniqueIndex("calculation_input_unique").on(table.operation, table.inputHash), index("calculation_status_idx").on(table.status, table.startedAt)]);

export const watchlists = pgTable("watchlists", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  ...createdUpdated(),
}, (table) => [uniqueIndex("watchlist_user_name_unique").on(table.userId, table.name), index("watchlist_user_idx").on(table.userId)]);

export const watchlistItems = pgTable("watchlist_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  watchlistId: uuid("watchlist_id").references(() => watchlists.id, { onDelete: "cascade" }).notNull(),
  instrumentId: uuid("instrument_id").references(() => instruments.id, { onDelete: "cascade" }).notNull(),
  position: integer("position").default(0).notNull(),
  notes: text("notes"),
  ...createdUpdated(),
}, (table) => [uniqueIndex("watchlist_item_unique").on(table.watchlistId, table.instrumentId), index("watchlist_item_order_idx").on(table.watchlistId, table.position)]);

export const portfolios = pgTable("portfolios", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  baseCurrency: varchar("base_currency", { length: 3 }).default("USD").notNull(),
  ...createdUpdated(),
}, (table) => [uniqueIndex("portfolio_user_name_unique").on(table.userId, table.name), index("portfolio_user_idx").on(table.userId)]);

export const portfolioTransactions = pgTable("portfolio_transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  portfolioId: uuid("portfolio_id").references(() => portfolios.id, { onDelete: "cascade" }).notNull(),
  instrumentId: uuid("instrument_id").references(() => instruments.id),
  type: transactionType("type").notNull(),
  executedAt: timestamp("executed_at", { withTimezone: true }).notNull(),
  quantity: numeric("quantity", { precision: 30, scale: 10 }),
  price: numeric("price", { precision: 30, scale: 10 }),
  fees: numeric("fees", { precision: 30, scale: 10 }).default("0").notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  externalId: varchar("external_id", { length: 180 }),
  notes: text("notes"),
  ...createdUpdated(),
}, (table) => [index("portfolio_transaction_time_idx").on(table.portfolioId, table.executedAt), uniqueIndex("portfolio_external_transaction_unique").on(table.portfolioId, table.externalId)]);

export const portfolioPositions = pgTable("portfolio_positions", {
  portfolioId: uuid("portfolio_id").references(() => portfolios.id, { onDelete: "cascade" }).notNull(),
  instrumentId: uuid("instrument_id").references(() => instruments.id, { onDelete: "cascade" }).notNull(),
  quantity: numeric("quantity", { precision: 30, scale: 10 }).notNull(),
  averagePrice: numeric("average_price", { precision: 30, scale: 10 }).notNull(),
  realizedPnl: numeric("realized_pnl", { precision: 30, scale: 10 }).default("0").notNull(),
  calculatedAt: timestamp("calculated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [primaryKey({ columns: [table.portfolioId, table.instrumentId] })]);

export const alerts = pgTable("alerts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  instrumentId: uuid("instrument_id").references(() => instruments.id),
  type: varchar("type", { length: 80 }).notNull(),
  status: alertStatus("status").default("ACTIVE").notNull(),
  configuration: jsonb("configuration").$type<Record<string, unknown>>().notNull(),
  lastEvaluatedAt: timestamp("last_evaluated_at", { withTimezone: true }),
  triggeredAt: timestamp("triggered_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  ...createdUpdated(),
}, (table) => [index("alert_evaluation_idx").on(table.status, table.lastEvaluatedAt), index("alert_user_idx").on(table.userId)]);

export const alertEvents = pgTable("alert_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  alertId: uuid("alert_id").references(() => alerts.id, { onDelete: "cascade" }).notNull(),
  deduplicationKey: varchar("deduplication_key", { length: 180 }).notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("alert_event_dedupe_unique").on(table.alertId, table.deduplicationKey)]);

export const backtestRuns = pgTable("backtest_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  status: backtestStatus("status").default("QUEUED").notNull(),
  configurationHash: varchar("configuration_hash", { length: 128 }).notNull(),
  configuration: jsonb("configuration").$type<Record<string, unknown>>().notNull(),
  metrics: jsonb("metrics").$type<Record<string, number | null>>(),
  equityCurve: jsonb("equity_curve").$type<Array<{ timestamp: string; value: number }>>(),
  modelVersion: varchar("model_version", { length: 80 }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  runtimeMs: integer("runtime_ms"),
  errorCode: varchar("error_code", { length: 80 }),
  ...createdUpdated(),
}, (table) => [index("backtest_user_created_idx").on(table.userId, table.createdAt), index("backtest_status_idx").on(table.status)]);

export const backtestTrades = pgTable("backtest_trades", {
  id: uuid("id").defaultRandom().primaryKey(),
  backtestRunId: uuid("backtest_run_id").references(() => backtestRuns.id, { onDelete: "cascade" }).notNull(),
  instrumentId: uuid("instrument_id").references(() => instruments.id).notNull(),
  side: varchar("side", { length: 8 }).notNull(),
  entryAt: timestamp("entry_at", { withTimezone: true }).notNull(),
  exitAt: timestamp("exit_at", { withTimezone: true }),
  entryPrice: numeric("entry_price", { precision: 30, scale: 10 }).notNull(),
  exitPrice: numeric("exit_price", { precision: 30, scale: 10 }),
  quantity: numeric("quantity", { precision: 30, scale: 10 }).notNull(),
  costs: numeric("costs", { precision: 30, scale: 10 }).default("0").notNull(),
  pnl: numeric("pnl", { precision: 30, scale: 10 }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
}, (table) => [index("backtest_trade_run_time_idx").on(table.backtestRunId, table.entryAt)]);

export const providerRequestLogs = pgTable("provider_request_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  provider: varchar("provider", { length: 40 }).notNull(),
  operation: varchar("operation", { length: 100 }).notNull(),
  requestId: uuid("request_id"),
  status: varchar("status", { length: 30 }).notNull(),
  errorCode: varchar("error_code", { length: 80 }),
  latencyMs: integer("latency_ms").notNull(),
  cacheStatus: varchar("cache_status", { length: 20 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("provider_log_time_idx").on(table.provider, table.createdAt), index("provider_log_error_idx").on(table.errorCode, table.createdAt)]);

export const providerHealthSnapshots = pgTable("provider_health_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  provider: varchar("provider", { length: 40 }).notNull(),
  status: varchar("status", { length: 30 }).notNull(),
  latencyMs: integer("latency_ms"),
  errorCode: varchar("error_code", { length: 80 }),
  checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("provider_health_time_idx").on(table.provider, table.checkedAt)]);
