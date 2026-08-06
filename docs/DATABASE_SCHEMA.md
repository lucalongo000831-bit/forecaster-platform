# Database schema

PostgreSQL with Drizzle ORM is selected for a small serverless runtime, explicit SQL migrations and typed repository access. Numeric financial values use PostgreSQL `numeric`; timestamps use timezone-aware UTC columns.

## Identity and ownership

- `users`, `accounts`, `sessions`, `verification_tokens`.
- `watchlists` -> `watchlist_items` -> `instruments`.
- `portfolios` -> `portfolio_transactions`; positions are derived materialized views/snapshots, not duplicated source truth.
- `alerts` -> `alert_events`.

## Market reference and observations

- `exchanges`, `instruments`, `instrument_symbols` for provider-specific identifiers.
- `quote_snapshots`, `price_bars`, `corporate_actions`, `dividends`, `splits`.
- unique bar constraint: `(instrument_id, interval, timestamp, provider)`.
- instrument lookup indexes: `(canonical_symbol, exchange_id)`, `mic`, `slug`, provider symbol.

## Fundamentals and intelligence

- `company_profiles`, `income_statements`, `balance_sheets`, `cash_flow_statements`.
- `fundamental_metrics`, `analyst_estimates`, `analyst_ratings`, `analyst_price_targets`.
- `news_items`, `news_entities`, `news_instrument_relations`, `macro_events`.
- `technical_indicator_snapshots`, `seasonality_snapshots`, `signal_snapshots`, `forecast_snapshots`, `target_snapshots`, `risk_plan_snapshots`.
- `model_versions`, `calculation_runs` make every result reproducible.

## Backtest and operations

- `backtest_runs`, `backtest_trades` with immutable configuration hashes.
- `provider_request_logs` and `provider_health_snapshots` contain categories/latency only, never payload secrets.
- job state/locks use Redis in production and database uniqueness for idempotency.

## Common provenance columns

Financial tables include provider, provider record ID, source/fetched/calculated/expiry timestamps, model version, data quality, delayed/fallback flags, metadata JSON, created/updated timestamps.

## Retention

- quote snapshots: seven days by default; retain selected close snapshots longer.
- price bars, corporate actions, news and backtests: long-lived, deduplicated.
- provider request logs: 30 days; health snapshots: 90 days.
- model outputs: versioned and retained while referenced by a user/backtest.

Migrations are forward-only. Production schema changes require a backup and `drizzle-kit migrate`; destructive cleanup is a separate, explicitly approved operation.
