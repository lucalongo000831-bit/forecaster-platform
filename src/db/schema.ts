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
export const politicalChamber = pgEnum("political_chamber", ["HOUSE", "SENATE", "UNKNOWN"]);
export const politicalParty = pgEnum("political_party", ["DEMOCRATIC", "REPUBLICAN", "INDEPENDENT", "OTHER", "UNKNOWN"]);
export const politicalOwnerType = pgEnum("political_owner_type", ["SELF", "SPOUSE", "DEPENDENT", "JOINT", "TRUST", "OTHER", "UNKNOWN"]);
export const politicalTransactionKind = pgEnum("political_transaction_kind", ["PURCHASE", "SALE_FULL", "SALE_PARTIAL", "SALE", "EXCHANGE", "OPTION", "OTHER", "UNKNOWN"]);
export const politicalVerificationStatus = pgEnum("political_verification_status", ["PROVIDER_ONLY", "OFFICIAL_SOURCE_VERIFIED", "SOURCE_MISMATCH", "PENDING", "UNVERIFIABLE"]);

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

export const issuers = pgTable("issuers", {
  id: uuid("id").defaultRandom().primaryKey(),
  legalName: varchar("legal_name", { length: 320 }).notNull(),
  countryCode: varchar("country_code", { length: 2 }),
  lei: varchar("lei", { length: 20 }),
  cik: varchar("cik", { length: 10 }),
  primaryIsin: varchar("primary_isin", { length: 12 }),
  website: text("website"),
  sector: varchar("sector", { length: 160 }),
  industry: varchar("industry", { length: 180 }),
  identifiers: jsonb("identifiers").$type<Record<string, string>>().default({}).notNull(),
  ...createdUpdated(),
}, (table) => [uniqueIndex("issuers_lei_unique").on(table.lei), uniqueIndex("issuers_cik_unique").on(table.cik), index("issuers_name_idx").on(table.legalName)]);

export const instruments = pgTable("instruments", {
  id: uuid("id").defaultRandom().primaryKey(),
  issuerId: uuid("issuer_id").references(() => issuers.id, { onDelete: "set null" }),
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
  isin: varchar("isin", { length: 12 }),
  figi: varchar("figi", { length: 20 }),
  providerSymbols: jsonb("provider_symbols").$type<Record<string, { symbol: string; exchangeCode?: string | null; providerInstrumentId?: string | null }>>().default({}).notNull(),
  active: boolean("active").default(true).notNull(),
  delistedAt: timestamp("delisted_at", { withTimezone: true }),
  ...createdUpdated(),
}, (table) => [
  uniqueIndex("instruments_slug_unique").on(table.slug),
  uniqueIndex("instruments_symbol_exchange_unique").on(table.canonicalSymbol, table.exchangeId),
  index("instruments_search_idx").on(table.canonicalSymbol, table.name),
  index("instruments_type_idx").on(table.type, table.active),
  index("instruments_issuer_idx").on(table.issuerId),
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

export const providerRuns = pgTable("provider_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  provider: varchar("provider", { length: 40 }).notNull(),
  dataset: varchar("dataset", { length: 100 }).notNull(),
  operation: varchar("operation", { length: 100 }).notNull(),
  priority: varchar("priority", { length: 16 }).default("NORMAL").notNull(),
  status: varchar("status", { length: 30 }).notNull(),
  httpStatus: integer("http_status"),
  latencyMs: integer("latency_ms"),
  recordsFetched: integer("records_fetched").default(0).notNull(),
  recordsStored: integer("records_stored").default(0).notNull(),
  errorClass: varchar("error_class", { length: 40 }),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
}, (table) => [index("provider_runs_provider_time_idx").on(table.provider, table.startedAt), index("provider_runs_dataset_status_idx").on(table.dataset, table.status)]);

export const providerQuotaStates = pgTable("provider_quota_states", {
  provider: varchar("provider", { length: 40 }).primaryKey(),
  minuteCount: integer("minute_count").default(0).notNull(),
  hourCount: integer("hour_count").default(0).notNull(),
  dayCount: integer("day_count").default(0).notNull(),
  reservedRemaining: integer("reserved_remaining"),
  windowMinute: timestamp("window_minute", { withTimezone: true }),
  windowHour: timestamp("window_hour", { withTimezone: true }),
  windowDay: timestamp("window_day", { withTimezone: true }),
  circuitState: varchar("circuit_state", { length: 24 }).default("UNKNOWN").notNull(),
  circuitOpenUntil: timestamp("circuit_open_until", { withTimezone: true }),
  lastRateLimitedAt: timestamp("last_rate_limited_at", { withTimezone: true }),
  failuresToday: integer("failures_today").default(0).notNull(),
  ...createdUpdated(),
});

export const providerWatermarks = pgTable("provider_watermarks", {
  id: uuid("id").defaultRandom().primaryKey(),
  provider: varchar("provider", { length: 40 }).notNull(),
  dataset: varchar("dataset", { length: 100 }).notNull(),
  lastAttempt: timestamp("last_attempt", { withTimezone: true }),
  lastSuccessfulSync: timestamp("last_successful_sync", { withTimezone: true }),
  lastExternalTimestamp: timestamp("last_external_timestamp", { withTimezone: true }),
  cursor: text("cursor"),
  latestRecordId: varchar("latest_record_id", { length: 220 }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  ...createdUpdated(),
}, (table) => [uniqueIndex("provider_watermark_unique").on(table.provider, table.dataset), index("provider_watermark_sync_idx").on(table.lastSuccessfulSync)]);

export const rawProviderRecords = pgTable("raw_provider_records", {
  id: uuid("id").defaultRandom().primaryKey(),
  provider: varchar("provider", { length: 40 }).notNull(),
  dataset: varchar("dataset", { length: 100 }).notNull(),
  externalId: varchar("external_id", { length: 240 }),
  entityKey: varchar("entity_key", { length: 240 }).notNull(),
  instrumentId: uuid("instrument_id").references(() => instruments.id, { onDelete: "set null" }),
  issuerId: uuid("issuer_id").references(() => issuers.id, { onDelete: "set null" }),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
  sourceUrl: text("source_url"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
  sourcePublishedAt: timestamp("source_published_at", { withTimezone: true }),
  schemaVersion: varchar("schema_version", { length: 40 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("raw_provider_payload_unique").on(table.provider, table.dataset, table.payloadHash), index("raw_provider_entity_idx").on(table.entityKey, table.fetchedAt), index("raw_provider_instrument_idx").on(table.instrumentId, table.dataset)]);

export const rawSourceDocuments = pgTable("raw_source_documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  source: varchar("source", { length: 60 }).notNull(),
  dataset: varchar("dataset", { length: 100 }).notNull(),
  externalId: varchar("external_id", { length: 240 }).notNull(),
  entityKey: varchar("entity_key", { length: 240 }).notNull(),
  contentHash: varchar("content_hash", { length: 64 }).notNull(),
  mediaType: varchar("media_type", { length: 120 }),
  sourceUrl: text("source_url"),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  availableAt: timestamp("available_at", { withTimezone: true }),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
  schemaVersion: varchar("schema_version", { length: 40 }).notNull(),
}, (table) => [uniqueIndex("raw_source_document_unique").on(table.source, table.externalId, table.contentHash), index("raw_source_document_entity_idx").on(table.entityKey, table.publishedAt)]);

export const normalizedMarketObservations = pgTable("normalized_market_observations", {
  id: uuid("id").defaultRandom().primaryKey(),
  instrumentId: uuid("instrument_id").references(() => instruments.id, { onDelete: "cascade" }).notNull(),
  metric: varchar("metric", { length: 80 }).notNull(),
  value: numeric("value", { precision: 38, scale: 12 }),
  unit: varchar("unit", { length: 40 }),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  effectiveAt: timestamp("effective_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  availableAt: timestamp("available_at", { withTimezone: true }).notNull(),
  provider: varchar("provider", { length: 40 }).notNull(),
  status: varchar("status", { length: 32 }).default("AVAILABLE").notNull(),
  schemaVersion: varchar("schema_version", { length: 40 }).notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("normalized_market_observation_unique").on(table.instrumentId, table.metric, table.observedAt, table.provider), index("normalized_market_metric_time_idx").on(table.instrumentId, table.metric, table.observedAt)]);

export const economicSeries = pgTable("economic_series", {
  id: uuid("id").defaultRandom().primaryKey(),
  internalKey: varchar("internal_key", { length: 100 }).notNull(),
  provider: varchar("provider", { length: 40 }).notNull(),
  externalSeriesId: varchar("external_series_id", { length: 160 }).notNull(),
  country: varchar("country", { length: 8 }),
  category: varchar("category", { length: 60 }).notNull(),
  frequency: varchar("frequency", { length: 24 }).notNull(),
  unit: varchar("unit", { length: 80 }),
  importance: varchar("importance", { length: 16 }).default("MEDIUM").notNull(),
  transform: varchar("transform", { length: 24 }).default("LEVEL").notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  ...createdUpdated(),
}, (table) => [uniqueIndex("economic_series_internal_unique").on(table.internalKey), uniqueIndex("economic_series_provider_external_unique").on(table.provider, table.externalSeriesId)]);

export const normalizedEconomicObservations = pgTable("normalized_economic_observations", {
  id: uuid("id").defaultRandom().primaryKey(),
  seriesId: uuid("series_id").references(() => economicSeries.id, { onDelete: "cascade" }).notNull(),
  value: numeric("value", { precision: 38, scale: 12 }),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  effectiveAt: timestamp("effective_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  availableAt: timestamp("available_at", { withTimezone: true }).notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
  status: varchar("status", { length: 32 }).default("AVAILABLE").notNull(),
  provider: varchar("provider", { length: 40 }).notNull(),
  schemaVersion: varchar("schema_version", { length: 40 }).notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
}, (table) => [uniqueIndex("economic_observation_unique").on(table.seriesId, table.observedAt, table.availableAt, table.provider), index("economic_observation_series_time_idx").on(table.seriesId, table.observedAt)]);

export const economicReleaseEvents = pgTable("economic_release_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  seriesId: uuid("series_id").references(() => economicSeries.id, { onDelete: "set null" }),
  provider: varchar("provider", { length: 40 }).notNull(),
  sourceId: varchar("source_id", { length: 220 }).notNull(),
  title: text("title").notNull(),
  country: varchar("country", { length: 8 }),
  importance: varchar("importance", { length: 16 }).default("MEDIUM").notNull(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  availableAt: timestamp("available_at", { withTimezone: true }),
  actual: numeric("actual", { precision: 38, scale: 12 }),
  forecast: numeric("forecast", { precision: 38, scale: 12 }),
  previous: numeric("previous", { precision: 38, scale: 12 }),
  status: varchar("status", { length: 32 }).default("AVAILABLE").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  ...createdUpdated(),
}, (table) => [uniqueIndex("economic_release_provider_source_unique").on(table.provider, table.sourceId), index("economic_release_time_idx").on(table.scheduledAt, table.country)]);

export const positioningObservations = pgTable("positioning_observations", {
  id: uuid("id").defaultRandom().primaryKey(),
  market: varchar("market", { length: 120 }).notNull(),
  contract: varchar("contract", { length: 180 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  long: numeric("long", { precision: 38, scale: 4 }),
  short: numeric("short", { precision: 38, scale: 4 }),
  spreading: numeric("spreading", { precision: 38, scale: 4 }),
  net: numeric("net", { precision: 38, scale: 4 }),
  openInterest: numeric("open_interest", { precision: 38, scale: 4 }),
  reportDate: timestamp("report_date", { withTimezone: true }).notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
  availableAt: timestamp("available_at", { withTimezone: true }).notNull(),
  source: varchar("source", { length: 60 }).notNull(),
  sourceId: varchar("source_id", { length: 220 }).notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("positioning_source_record_unique").on(table.source, table.sourceId), index("positioning_contract_date_idx").on(table.contract, table.reportDate)]);

export const dataSnapshots = pgTable("data_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  dataset: varchar("dataset", { length: 100 }).notNull(),
  entityKey: varchar("entity_key", { length: 240 }).default("global").notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  freshness: varchar("freshness", { length: 24 }).notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  recordCount: integer("record_count").notNull(),
  coverage: numeric("coverage", { precision: 8, scale: 4 }),
  sourceTimestamp: timestamp("source_timestamp", { withTimezone: true }),
  calculatedAt: timestamp("calculated_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  schemaVersion: varchar("schema_version", { length: 40 }).notNull(),
  modelVersion: varchar("model_version", { length: 80 }),
  published: boolean("published").default(false).notNull(),
  qualityReasons: jsonb("quality_reasons").$type<string[]>().default([]).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("data_snapshot_dataset_time_idx").on(table.dataset, table.entityKey, table.calculatedAt), index("data_snapshot_published_idx").on(table.published, table.dataset)]);

export const lastKnownGood = pgTable("last_known_good", {
  id: uuid("id").defaultRandom().primaryKey(),
  dataset: varchar("dataset", { length: 100 }).notNull(),
  entityKey: varchar("entity_key", { length: 240 }).default("global").notNull(),
  snapshotId: uuid("snapshot_id").references(() => dataSnapshots.id, { onDelete: "restrict" }).notNull(),
  promotedAt: timestamp("promoted_at", { withTimezone: true }).defaultNow().notNull(),
  validUntil: timestamp("valid_until", { withTimezone: true }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  ...createdUpdated(),
}, (table) => [uniqueIndex("last_known_good_dataset_entity_unique").on(table.dataset, table.entityKey), index("last_known_good_snapshot_idx").on(table.snapshotId)]);

export const dataConflicts = pgTable("data_conflicts", {
  id: uuid("id").defaultRandom().primaryKey(),
  dataset: varchar("dataset", { length: 100 }).notNull(),
  entityKey: varchar("entity_key", { length: 240 }).notNull(),
  field: varchar("field", { length: 220 }).notNull(),
  primarySource: varchar("primary_source", { length: 60 }).notNull(),
  alternateSource: varchar("alternate_source", { length: 60 }).notNull(),
  primaryValue: jsonb("primary_value").$type<unknown>(),
  alternateValue: jsonb("alternate_value").$type<unknown>(),
  resolution: varchar("resolution", { length: 40 }).default("UNRESOLVED").notNull(),
  detectedAt: timestamp("detected_at", { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
}, (table) => [index("data_conflict_dataset_idx").on(table.dataset, table.entityKey, table.detectedAt)]);

export const dataQualityRecords = pgTable("data_quality_records", {
  id: uuid("id").defaultRandom().primaryKey(),
  dataset: varchar("dataset", { length: 100 }).notNull(),
  entityKey: varchar("entity_key", { length: 240 }).default("global").notNull(),
  snapshotId: uuid("snapshot_id").references(() => dataSnapshots.id, { onDelete: "set null" }),
  status: varchar("status", { length: 32 }).notNull(),
  coverage: numeric("coverage", { precision: 8, scale: 4 }),
  freshnessScore: numeric("freshness_score", { precision: 8, scale: 4 }),
  sourceQuality: numeric("source_quality", { precision: 8, scale: 4 }),
  conflictRate: numeric("conflict_rate", { precision: 8, scale: 4 }),
  mappingRate: numeric("mapping_rate", { precision: 8, scale: 4 }),
  anomalies: jsonb("anomalies").$type<string[]>().default([]).notNull(),
  evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("data_quality_dataset_time_idx").on(table.dataset, table.entityKey, table.evaluatedAt)]);

export const ingestionJobs = pgTable("ingestion_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  dataset: varchar("dataset", { length: 100 }).notNull(),
  provider: varchar("provider", { length: 40 }),
  schedule: varchar("schedule", { length: 80 }),
  enabled: boolean("enabled").default(true).notNull(),
  priority: varchar("priority", { length: 16 }).default("BACKGROUND").notNull(),
  configuration: jsonb("configuration").$type<Record<string, unknown>>().default({}).notNull(),
  ...createdUpdated(),
}, (table) => [uniqueIndex("ingestion_job_name_unique").on(table.name), index("ingestion_job_dataset_idx").on(table.dataset, table.enabled)]);

export const ingestionRuns = pgTable("ingestion_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  jobId: uuid("job_id").references(() => ingestionJobs.id, { onDelete: "set null" }),
  jobName: varchar("job_name", { length: 120 }).notNull(),
  provider: varchar("provider", { length: 40 }),
  status: varchar("status", { length: 30 }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  recordsFetched: integer("records_fetched").default(0).notNull(),
  recordsInserted: integer("records_inserted").default(0).notNull(),
  recordsUpdated: integer("records_updated").default(0).notNull(),
  recordsSkipped: integer("records_skipped").default(0).notNull(),
  errors: integer("errors").default(0).notNull(),
  watermark: jsonb("watermark").$type<Record<string, unknown>>().default({}).notNull(),
  errorClass: varchar("error_class", { length: 40 }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
}, (table) => [index("ingestion_run_job_time_idx").on(table.jobName, table.startedAt), index("ingestion_run_status_idx").on(table.status, table.startedAt)]);

export const politicians = pgTable("politicians", {
  id: varchar("id", { length: 80 }).primaryKey(),
  normalizedName: varchar("normalized_name", { length: 220 }).notNull(),
  displayName: varchar("display_name", { length: 220 }).notNull(),
  chamber: politicalChamber("chamber").default("UNKNOWN").notNull(),
  party: politicalParty("party").default("UNKNOWN").notNull(),
  state: varchar("state", { length: 80 }),
  district: varchar("district", { length: 120 }),
  activeStatus: varchar("active_status", { length: 20 }).default("UNKNOWN").notNull(),
  sourceIdentifiers: jsonb("source_identifiers").$type<Record<string, string>>().default({}).notNull(),
  ...createdUpdated(),
}, (table) => [uniqueIndex("politicians_normalized_identity_unique").on(table.normalizedName, table.chamber, table.state), index("politicians_name_idx").on(table.displayName)]);

export const politicalFilings = pgTable("political_filings", {
  id: uuid("id").defaultRandom().primaryKey(),
  politicianId: varchar("politician_id", { length: 80 }).references(() => politicians.id, { onDelete: "cascade" }).notNull(),
  provider: varchar("provider", { length: 40 }).notNull(),
  sourceId: varchar("source_id", { length: 220 }).notNull(),
  filingType: varchar("filing_type", { length: 80 }),
  disclosureDate: timestamp("disclosure_date", { withTimezone: true }).notNull(),
  sourceUrl: text("source_url"),
  amendment: boolean("amendment").default(false).notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
  ...createdUpdated(),
}, (table) => [uniqueIndex("political_filings_provider_source_unique").on(table.provider, table.sourceId), index("political_filings_politician_date_idx").on(table.politicianId, table.disclosureDate)]);

export const politicalTransactions = pgTable("political_transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  sourceId: varchar("source_id", { length: 220 }).notNull(),
  fingerprint: varchar("fingerprint", { length: 80 }).notNull(),
  politicianId: varchar("politician_id", { length: 80 }).references(() => politicians.id, { onDelete: "cascade" }).notNull(),
  filingId: uuid("filing_id").references(() => politicalFilings.id, { onDelete: "set null" }),
  instrumentId: uuid("instrument_id").references(() => instruments.id, { onDelete: "set null" }),
  canonicalIssuerId: uuid("canonical_issuer_id").references(() => issuers.id, { onDelete: "set null" }),
  chamber: politicalChamber("chamber").notNull(), party: politicalParty("party").notNull(), state: varchar("state", { length: 80 }), district: varchar("district", { length: 120 }), ownerType: politicalOwnerType("owner_type").notNull(),
  assetName: text("asset_name").notNull(), assetType: varchar("asset_type", { length: 120 }), rawTicker: varchar("raw_ticker", { length: 100 }), symbol: varchar("symbol", { length: 100 }), sector: varchar("sector", { length: 160 }),
  transactionType: politicalTransactionKind("transaction_type").notNull(), transactionDate: timestamp("transaction_date", { withTimezone: true }).notNull(), disclosureDate: timestamp("disclosure_date", { withTimezone: true }).notNull(), marketAvailableDate: timestamp("market_available_date", { withTimezone: true }).notNull(), disclosureDelayDays: integer("disclosure_delay_days").notNull(),
  amountMin: numeric("amount_min", { precision: 38, scale: 4 }), amountMax: numeric("amount_max", { precision: 38, scale: 4 }), amountRangeRaw: varchar("amount_range_raw", { length: 160 }), estimatedAmount: numeric("estimated_amount", { precision: 38, scale: 4 }), amountMethod: varchar("amount_method", { length: 32 }).notNull(),
  priceAtTransaction: numeric("price_at_transaction", { precision: 30, scale: 10 }), priceAtDisclosure: numeric("price_at_disclosure", { precision: 30, scale: 10 }), currentPrice: numeric("current_price", { precision: 30, scale: 10 }), sharesEstimate: numeric("shares_estimate", { precision: 38, scale: 10 }),
  source: text("source").notNull(), sourceUrl: text("source_url"), filingType: varchar("filing_type", { length: 80 }), provider: varchar("provider", { length: 40 }).notNull(), fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(), verified: boolean("verified").default(false).notNull(), verificationStatus: politicalVerificationStatus("verification_status").notNull(), resolutionStatus: varchar("resolution_status", { length: 32 }).notNull(), amendment: boolean("amendment").default(false).notNull(),
  rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>().default({}).notNull(), ...createdUpdated(),
}, (table) => [uniqueIndex("political_transactions_fingerprint_unique").on(table.fingerprint), index("political_transactions_politician_idx").on(table.politicianId), index("political_transactions_instrument_disclosure_idx").on(table.instrumentId, table.disclosureDate), index("political_transactions_transaction_date_idx").on(table.transactionDate), index("political_transactions_disclosure_date_idx").on(table.disclosureDate), index("political_transactions_chamber_type_idx").on(table.chamber, table.transactionType), index("political_transactions_issuer_idx").on(table.canonicalIssuerId), index("political_transactions_created_idx").on(table.createdAt)]);

export const politicalActivitySnapshots = pgTable("political_activity_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(), instrumentId: uuid("instrument_id").references(() => instruments.id, { onDelete: "cascade" }), period: varchar("period", { length: 16 }).notNull(), purchaseCount: integer("purchase_count").notNull(), saleCount: integer("sale_count").notNull(), purchaseMin: numeric("purchase_min", { precision: 38, scale: 4 }).notNull(), purchaseMax: numeric("purchase_max", { precision: 38, scale: 4 }).notNull(), saleMin: numeric("sale_min", { precision: 38, scale: 4 }).notNull(), saleMax: numeric("sale_max", { precision: 38, scale: 4 }).notNull(), uniqueBuyers: integer("unique_buyers").notNull(), uniqueSellers: integer("unique_sellers").notNull(), houseCount: integer("house_count").notNull(), senateCount: integer("senate_count").notNull(), clusterBuying: varchar("cluster_buying", { length: 16 }).notNull(), clusterSelling: varchar("cluster_selling", { length: 16 }).notNull(), intensityScore: numeric("intensity_score", { precision: 8, scale: 4 }).notNull(), direction: varchar("direction", { length: 32 }).notNull(), confidence: varchar("confidence", { length: 20 }).notNull(), payload: jsonb("payload").$type<Record<string, unknown>>().notNull(), modelVersion: varchar("model_version", { length: 80 }).notNull(), calculatedAt: timestamp("calculated_at", { withTimezone: true }).notNull(), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("political_activity_instrument_period_time_idx").on(table.instrumentId, table.period, table.calculatedAt)]);

export const politicalTradePerformances = pgTable("political_trade_performances", {
  id: uuid("id").defaultRandom().primaryKey(), politicalTransactionId: uuid("political_transaction_id").references(() => politicalTransactions.id, { onDelete: "cascade" }).notNull(), benchmarkSymbol: varchar("benchmark_symbol", { length: 64 }).notNull(), marketAvailableDate: timestamp("market_available_date", { withTimezone: true }).notNull(), payload: jsonb("payload").$type<Record<string, unknown>>().notNull(), classification: varchar("classification", { length: 32 }).notNull(), modelVersion: varchar("model_version", { length: 80 }).notNull(), calculatedAt: timestamp("calculated_at", { withTimezone: true }).notNull(),
}, (table) => [uniqueIndex("political_performance_transaction_model_unique").on(table.politicalTransactionId, table.modelVersion), index("political_performance_available_date_idx").on(table.marketAvailableDate)]);

export const politicalClusters = pgTable("political_clusters", {
  id: varchar("id", { length: 100 }).primaryKey(), instrumentId: uuid("instrument_id").references(() => instruments.id, { onDelete: "set null" }), symbol: varchar("symbol", { length: 64 }), direction: varchar("direction", { length: 16 }).notNull(), strength: varchar("strength", { length: 16 }).notNull(), windowDays: integer("window_days").notNull(), uniquePoliticians: integer("unique_politicians").notNull(), transactionCount: integer("transaction_count").notNull(), estimatedAmount: numeric("estimated_amount", { precision: 38, scale: 4 }).notNull(), firstDisclosureDate: timestamp("first_disclosure_date", { withTimezone: true }).notNull(), lastDisclosureDate: timestamp("last_disclosure_date", { withTimezone: true }).notNull(), payload: jsonb("payload").$type<Record<string, unknown>>().notNull(), modelVersion: varchar("model_version", { length: 80 }).notNull(), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("political_cluster_instrument_date_idx").on(table.instrumentId, table.lastDisclosureDate), index("political_cluster_strength_idx").on(table.strength, table.lastDisclosureDate)]);

export const politicalDataVerifications = pgTable("political_data_verifications", {
  id: uuid("id").defaultRandom().primaryKey(), politicalTransactionId: uuid("political_transaction_id").references(() => politicalTransactions.id, { onDelete: "cascade" }).notNull(), status: politicalVerificationStatus("status").notNull(), sourceUrl: text("source_url"), providerPayload: jsonb("provider_payload").$type<Record<string, unknown>>().default({}).notNull(), officialPayload: jsonb("official_payload").$type<Record<string, unknown>>().default({}).notNull(), conflicts: jsonb("conflicts").$type<Array<Record<string, unknown>>>().default([]).notNull(), verifiedAt: timestamp("verified_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("political_verification_transaction_idx").on(table.politicalTransactionId, table.createdAt), index("political_verification_status_idx").on(table.status)]);

export const politicalLeaderboardSnapshots = pgTable("political_leaderboard_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(), period: varchar("period", { length: 16 }).notNull(), payload: jsonb("payload").$type<Record<string, unknown>>().notNull(), dataCompleteness: numeric("data_completeness", { precision: 8, scale: 4 }).notNull(), modelVersion: varchar("model_version", { length: 80 }).notNull(), calculatedAt: timestamp("calculated_at", { withTimezone: true }).notNull(), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("political_leaderboard_period_time_idx").on(table.period, table.calculatedAt)]);

export const politicalAssetAliases = pgTable("political_asset_aliases", {
  id: uuid("id").defaultRandom().primaryKey(), rawAlias: varchar("raw_alias", { length: 320 }).notNull(), normalizedAlias: varchar("normalized_alias", { length: 320 }).notNull(), instrumentId: uuid("instrument_id").references(() => instruments.id, { onDelete: "cascade" }).notNull(), confidence: numeric("confidence", { precision: 8, scale: 6 }).notNull(), source: varchar("source", { length: 80 }).notNull(), active: boolean("active").default(true).notNull(), ...createdUpdated(),
}, (table) => [uniqueIndex("political_asset_alias_unique").on(table.normalizedAlias), index("political_asset_alias_instrument_idx").on(table.instrumentId)]);

export const politicalSyncStates = pgTable("political_sync_states", {
  key: varchar("key", { length: 80 }).primaryKey(), lastSuccessfulSync: timestamp("last_successful_sync", { withTimezone: true }), houseRecords: integer("house_records").default(0).notNull(), senateRecords: integer("senate_records").default(0).notNull(), mappedInstruments: integer("mapped_instruments").default(0).notNull(), unresolvedAssets: integer("unresolved_assets").default(0).notNull(), duplicatesRemoved: integer("duplicates_removed").default(0).notNull(), latestDisclosure: timestamp("latest_disclosure", { withTimezone: true }), providerStatus: varchar("provider_status", { length: 24 }).default("UNKNOWN").notNull(), metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(), ...createdUpdated(),
});

export const analysisDataBundleSnapshots = pgTable("analysis_data_bundle_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  instrumentId: uuid("instrument_id").references(() => instruments.id, { onDelete: "cascade" }).notNull(),
  bundleType: varchar("bundle_type", { length: 24 }).notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  provenance: jsonb("provenance").$type<Array<Record<string, unknown>>>().default([]).notNull(),
  missingData: jsonb("missing_data").$type<Array<Record<string, unknown>>>().default([]).notNull(),
  dataTimestamp: timestamp("data_timestamp", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("analysis_bundle_instrument_type_time_idx").on(table.instrumentId, table.bundleType, table.createdAt)]);

export const fieldProvenanceSnapshots = pgTable("field_provenance_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  instrumentId: uuid("instrument_id").references(() => instruments.id, { onDelete: "cascade" }).notNull(),
  fieldPath: varchar("field_path", { length: 220 }).notNull(),
  provider: varchar("provider", { length: 40 }).notNull(),
  quality: varchar("quality", { length: 24 }).notNull(),
  sourceTimestamp: timestamp("source_timestamp", { withTimezone: true }),
  formula: text("formula"),
  inputs: jsonb("inputs").$type<string[]>().default([]).notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("field_provenance_instrument_field_time_idx").on(table.instrumentId, table.fieldPath, table.createdAt)]);

const companyResultColumns = () => ({
  id: uuid("id").defaultRandom().primaryKey(),
  instrumentId: uuid("instrument_id").references(() => instruments.id, { onDelete: "cascade" }).notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  modelVersion: varchar("model_version", { length: 80 }).notNull(),
  dataTimestamp: timestamp("data_timestamp", { withTimezone: true }),
  calculatedAt: timestamp("calculated_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  providerMetadata: jsonb("provider_metadata").$type<Record<string, unknown>>().default({}).notNull(),
  methodologyMetadata: jsonb("methodology_metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const companyAnalysisSnapshots = pgTable("company_analysis_snapshots", {
  ...companyResultColumns(),
  symbol: varchar("symbol", { length: 64 }).notNull(),
  market: varchar("market", { length: 80 }).notNull(),
  score: numeric("score", { precision: 8, scale: 4 }),
  verdict: varchar("verdict", { length: 40 }).notNull(),
  shortVerdict: varchar("short_verdict", { length: 40 }),
  qualityScore: numeric("quality_score", { precision: 8, scale: 4 }),
  growthScore: numeric("growth_score", { precision: 8, scale: 4 }),
  valuationScore: numeric("valuation_score", { precision: 8, scale: 4 }),
  riskScore: numeric("risk_score", { precision: 8, scale: 4 }),
  moatScore: numeric("moat_score", { precision: 8, scale: 4 }),
  managementScore: numeric("management_score", { precision: 8, scale: 4 }),
  earningsQualityScore: numeric("earnings_quality_score", { precision: 8, scale: 4 }),
  fairValue: numeric("fair_value", { precision: 30, scale: 10 }),
  bearValue: numeric("bear_value", { precision: 30, scale: 10 }),
  baseValue: numeric("base_value", { precision: 30, scale: 10 }),
  bullValue: numeric("bull_value", { precision: 30, scale: 10 }),
  attractivePriceLow: numeric("attractive_price_low", { precision: 30, scale: 10 }),
  attractivePriceHigh: numeric("attractive_price_high", { precision: 30, scale: 10 }),
  avoidPrice: numeric("avoid_price", { precision: 30, scale: 10 }),
  marginOfSafety: numeric("margin_of_safety", { precision: 18, scale: 8 }),
  confidence: varchar("confidence", { length: 24 }).notNull(),
}, (table) => [index("company_analysis_instrument_time_idx").on(table.instrumentId, table.calculatedAt), index("company_analysis_symbol_time_idx").on(table.symbol, table.calculatedAt)]);

export const companyQualitySnapshots = pgTable("company_quality_snapshots", companyResultColumns(), (table) => [index("company_quality_time_idx").on(table.instrumentId, table.calculatedAt)]);
export const earningsQualitySnapshots = pgTable("earnings_quality_snapshots", companyResultColumns(), (table) => [index("earnings_quality_time_idx").on(table.instrumentId, table.calculatedAt)]);
export const moatAssessments = pgTable("moat_assessments", companyResultColumns(), (table) => [index("moat_assessment_time_idx").on(table.instrumentId, table.calculatedAt)]);
export const managementAssessments = pgTable("management_assessments", companyResultColumns(), (table) => [index("management_assessment_time_idx").on(table.instrumentId, table.calculatedAt)]);
export const peerGroups = pgTable("peer_groups", companyResultColumns(), (table) => [index("peer_group_time_idx").on(table.instrumentId, table.calculatedAt)]);
export const peerComparisonSnapshots = pgTable("peer_comparison_snapshots", companyResultColumns(), (table) => [index("peer_comparison_time_idx").on(table.instrumentId, table.calculatedAt)]);
export const valuationSnapshots = pgTable("valuation_snapshots", companyResultColumns(), (table) => [index("valuation_snapshot_time_idx").on(table.instrumentId, table.calculatedAt)]);
export const reverseDcfRuns = pgTable("reverse_dcf_runs", companyResultColumns(), (table) => [index("reverse_dcf_time_idx").on(table.instrumentId, table.calculatedAt)]);
export const dcfRuns = pgTable("dcf_runs", companyResultColumns(), (table) => [index("dcf_run_time_idx").on(table.instrumentId, table.calculatedAt)]);
export const investmentScenarios = pgTable("investment_scenarios", companyResultColumns(), (table) => [index("investment_scenario_time_idx").on(table.instrumentId, table.calculatedAt)]);
export const investmentTheses = pgTable("investment_theses", companyResultColumns(), (table) => [index("investment_thesis_time_idx").on(table.instrumentId, table.calculatedAt)]);
export const riskRegisterItems = pgTable("risk_register_items", companyResultColumns(), (table) => [index("risk_register_time_idx").on(table.instrumentId, table.calculatedAt)]);
export const companyRedFlags = pgTable("company_red_flags", companyResultColumns(), (table) => [index("company_red_flag_time_idx").on(table.instrumentId, table.calculatedAt)]);
export const companyCatalysts = pgTable("company_catalysts", companyResultColumns(), (table) => [index("company_catalyst_time_idx").on(table.instrumentId, table.calculatedAt)]);
export const timeHorizonAssessments = pgTable("time_horizon_assessments", { ...companyResultColumns(), horizon: varchar("horizon", { length: 32 }).notNull() }, (table) => [index("company_horizon_time_idx").on(table.instrumentId, table.horizon, table.calculatedAt)]);
export const dailyOutlooks = pgTable("daily_outlooks", companyResultColumns(), (table) => [index("daily_outlook_time_idx").on(table.instrumentId, table.calculatedAt)]);
export const operationalCalendarSnapshots = pgTable("operational_calendar_snapshots", companyResultColumns(), (table) => [index("operational_calendar_time_idx").on(table.instrumentId, table.calculatedAt)]);
export const companyAnalysisReports = pgTable("company_analysis_reports", { ...companyResultColumns(), userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }) }, (table) => [index("company_report_time_idx").on(table.instrumentId, table.calculatedAt), index("company_report_user_time_idx").on(table.userId, table.calculatedAt)]);

export const aiConversations = pgTable("ai_conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  instrumentId: uuid("instrument_id").references(() => instruments.id, { onDelete: "set null" }),
  symbol: varchar("symbol", { length: 64 }),
  market: varchar("market", { length: 80 }),
  assetType: varchar("asset_type", { length: 32 }),
  ...createdUpdated(),
}, (table) => [index("ai_conversation_user_updated_idx").on(table.userId, table.updatedAt)]);

export const aiMessages = pgTable("ai_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id").references(() => aiConversations.id, { onDelete: "cascade" }).notNull(),
  role: varchar("role", { length: 16 }).notNull(),
  content: text("content").notNull(),
  sources: jsonb("sources").$type<Array<Record<string, unknown>>>().default([]).notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("ai_message_conversation_time_idx").on(table.conversationId, table.createdAt)]);

export const aiToolCalls = pgTable("ai_tool_calls", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id").references(() => aiConversations.id, { onDelete: "cascade" }).notNull(),
  toolName: varchar("tool_name", { length: 100 }).notNull(),
  status: varchar("status", { length: 24 }).notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("ai_tool_call_conversation_time_idx").on(table.conversationId, table.createdAt)]);

export const globalRiskSnapshots = pgTable("global_risk_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  status: varchar("status", { length: 16 }).notNull(),
  score: numeric("score", { precision: 8, scale: 4 }).notNull(),
  systemicStress: varchar("systemic_stress", { length: 16 }).notNull(),
  trend: varchar("trend", { length: 32 }).notNull(),
  confidence: varchar("confidence", { length: 20 }).notNull(),
  dataCompleteness: numeric("data_completeness", { precision: 8, scale: 4 }).notNull(),
  volatilityScore: numeric("volatility_score", { precision: 8, scale: 4 }),
  creditScore: numeric("credit_score", { precision: 8, scale: 4 }),
  liquidityScore: numeric("liquidity_score", { precision: 8, scale: 4 }),
  ratesScore: numeric("rates_score", { precision: 8, scale: 4 }),
  breadthScore: numeric("breadth_score", { precision: 8, scale: 4 }),
  equityScore: numeric("equity_score", { precision: 8, scale: 4 }),
  crossAssetScore: numeric("cross_asset_score", { precision: 8, scale: 4 }),
  macroScore: numeric("macro_score", { precision: 8, scale: 4 }),
  newsRiskScore: numeric("news_risk_score", { precision: 8, scale: 4 }),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  modelVersion: varchar("model_version", { length: 80 }).notNull(),
  inputTimestamp: timestamp("input_timestamp", { withTimezone: true }).notNull(),
  calculatedAt: timestamp("calculated_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("global_risk_calculated_idx").on(table.calculatedAt), index("global_risk_status_idx").on(table.status, table.calculatedAt)]);

export const globalRiskComponentSnapshots = pgTable("global_risk_component_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  snapshotId: uuid("snapshot_id").references(() => globalRiskSnapshots.id, { onDelete: "cascade" }).notNull(),
  component: varchar("component", { length: 40 }).notNull(),
  score: numeric("score", { precision: 8, scale: 4 }),
  weight: numeric("weight", { precision: 8, scale: 6 }).notNull(),
  contribution: numeric("contribution", { precision: 8, scale: 4 }).notNull(),
  completeness: numeric("completeness", { precision: 8, scale: 4 }).notNull(),
  dataType: varchar("data_type", { length: 24 }).notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("global_risk_component_snapshot_idx").on(table.snapshotId, table.component)]);

export const globalRiskTriggers = pgTable("global_risk_triggers", {
  id: uuid("id").defaultRandom().primaryKey(),
  snapshotId: uuid("snapshot_id").references(() => globalRiskSnapshots.id, { onDelete: "cascade" }).notNull(),
  triggerKey: varchar("trigger_key", { length: 80 }).notNull(),
  direction: varchar("direction", { length: 20 }).notNull(),
  label: text("label").notNull(),
  threshold: text("threshold").notNull(),
  active: boolean("active").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("global_risk_trigger_snapshot_idx").on(table.snapshotId, table.direction)]);

export const globalMarketBriefs = pgTable("global_market_briefs", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: varchar("slug", { length: 80 }).notNull(),
  currentVersion: integer("current_version").default(0).notNull(),
  state: varchar("state", { length: 20 }).default("DRAFT").notNull(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  ...createdUpdated(),
}, (table) => [uniqueIndex("global_market_brief_slug_unique").on(table.slug), index("global_market_brief_state_idx").on(table.state, table.publishedAt)]);

export const globalMarketBriefVersions = pgTable("global_market_brief_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  briefId: uuid("brief_id").references(() => globalMarketBriefs.id, { onDelete: "cascade" }).notNull(),
  version: integer("version").notNull(),
  state: varchar("state", { length: 20 }).default("DRAFT").notNull(),
  title: varchar("title", { length: 240 }).notNull(),
  reportDate: timestamp("report_date", { withTimezone: true }).notNull(),
  status: varchar("status", { length: 16 }).notNull(),
  systemicStress: varchar("systemic_stress", { length: 16 }).notNull(),
  riskTrend: varchar("risk_trend", { length: 32 }).notNull(),
  summary: text("summary").notNull(),
  rawText: text("raw_text").notNull(),
  parsedData: jsonb("parsed_data").$type<Record<string, unknown>>().notNull(),
  publishedBy: uuid("published_by").references(() => users.id, { onDelete: "set null" }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("global_market_brief_version_unique").on(table.briefId, table.version), index("global_market_brief_version_published_idx").on(table.state, table.publishedAt)]);
