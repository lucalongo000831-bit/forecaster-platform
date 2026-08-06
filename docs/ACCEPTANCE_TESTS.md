# Acceptance tests

## Build and security gates

- `npm install`, lint, typecheck, unit/integration tests and `npm run build` pass.
- no tracked secret, `.env.local`, provider key or server credential appears in client bundles/logs.
- Vercel detects Next.js output automatically and Production reaches READY.
- provider imports and database/secret modules remain server-only.

## Instrument matrix

For AAPL, MSFT, NVDA, TSLA, AMZN, META, `^GSPC`, `^IXIC`, BTC-USD, ETH-USD, ENI.MI and STLAM.MI verify search, encoded navigation, quote metadata and applicable history. Verify absent corporate fundamentals for crypto/indices without fabricated substitutes.

## Data and model behavior

- charts support 1D, 5D, 1M, 3M, 6M, YTD, 1Y, 5Y, 10Y and MAX with valid OHLCV points.
- indicators reject insufficient/NaN input and never use future bars.
- fundamental metrics do not convert nulls to zero.
- seasonality exposes sample size/quality and labels 1Y descriptive.
- signal weights/configuration/model version are visible and insufficient quality suppresses output.
- analyst, technical, fundamental and composite targets remain distinct.
- forecast percentiles are monotonic and seeded simulations are reproducible.
- backtest next-bar execution, costs and no-look-ahead fixtures pass.

## Persistence and authorization

- account register/login/logout; unauthenticated private routes denied.
- two-user ownership tests cover watchlists, portfolios, transactions, alerts and backtests.
- duplicate watchlist items and alert notifications are prevented.
- portfolio arithmetic preserves precision and handles buy/sell/fees/dividends/splits.

## Failure matrix

- invalid/missing ticker, unavailable provider, timeout, 429, stale cache, missing fundamentals, closed market, database outage and malformed body produce typed responses without crashes.
- mock fallback is always marked DEMO and never enters analytics persistence.
- public health exposes no sensitive detail; protected health reports categories only.

## UI/E2E

Desktop/tablet/mobile flows cover dashboard, AAPL search/workspace/range, technicals, fundamentals, seasonality, targets, forecast, watchlist, portfolio transaction, alert, backtest, calendar and nonexistent ticker. Keyboard focus, labels, tables and chart text summaries are checked.
