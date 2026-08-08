# Live provider implementation report

Generated on the implementation branch `fix/live-financial-providers`. This report records implemented behavior and observed provider responses without exposing credentials or raw upstream payloads.

## Massive

- REST initialized server-side with `MASSIVE_API_KEY` and temporary `POLYGON_API_KEY` compatibility.
- Primary routing for supported US equities and `*-USD` crypto symbols.
- Unified snapshots supported when entitled; the configured account currently returns HTTP 403 for snapshot and last-trade endpoints.
- Operational quote fallback uses successful minute aggregates and labels their observed `DELAYED` status honestly. It does not manufacture bid/ask values.
- Aggregate charts and US market status verified successfully.
- Instrument polling: 5 seconds while an open/extended market is visible, 60 seconds while closed, suspended while hidden.
- Dashboard refresh: 30 seconds. Watchlists: 20 seconds after the first 15 seconds. Portfolios: 30 seconds. All use Page Visibility.
- Optional WebSocket/Redis gateway scaffolded under `services/realtime-gateway`; it is not required for the Vercel app.

## FMP

- Primary adapters implemented for profile, statements, metrics, ratios, growth, analyst estimates/ratings, target consensus, peers, earnings, dividends, economic calendar, Senate and House disclosures.
- Intraday/history and secondary quote adapters are available through the centralized router.
- The live smoke run reached FMP but every checked endpoint returned HTTP 429. This is an upstream account/quota condition, not hidden by demo data; Yahoo remains the honest fallback where supported.

## Alpha Vantage

- `NEWS_SENTIMENT` mapping includes title, summary, canonical URL, source, publication time, overall/ticker sentiment, relevance and topics.
- Macro adapter supports inflation, federal funds, real GDP and unemployment.
- Authentication and a live news response were verified. The combined smoke run observed quota/information responses on later calls, which are normalized as rate/provider errors and fall back through the router.

## Routing, freshness and reliability

- Components never choose or contact upstream providers directly.
- `MarketDataRouter`, `FundamentalsRouter`, `CalendarRouter`, `NewsRouter`, `PoliticalRouter` and `MacroRouter` centralize selection.
- Per-symbol batch routing lets Massive serve supported symbols while Yahoo serves international/index symbols in the same UI request.
- Cache policy uses short quote/intraday TTLs, longer fundamentals/calendar TTLs, stale-while-revalidate and single-flight stampede protection. Redis is used when configured; bounded process cache is the local fallback.
- Results expose provider, source timestamp, fetched time, freshness type, delay seconds, quality and fallback state.
- Timeouts, bounded retries, IP rate limits, validation, readable typed errors and safe structured logging are active.
- Protected `/preferences/providers` shows configuration and runtime health without credentials. Kairo AI is shown separately as disabled.

## Connected product surfaces

- Search, quote header, OHLCV charts, profile, fundamentals, statements, targets, technicals, forecasts, seasonality, news, calendar and political disclosures use the provider/service boundary.
- Company Intelligence uses provider quotes, FMP-first statements/fundamentals/analyst data and verified peers; all model outputs retain versions and timestamps.
- BTC/ETH now open Crypto Intelligence, not a lone “Company Intelligence not applicable” state. ETF and Index Intelligence avoid company-only EPS/DCF/EBITDA fields.
- Dashboard, watchlist and portfolio refresh automatically without a full browser reload.
- Calendar shows sourced category availability, counts, timezone and last calculation time; missing categories remain unavailable rather than becoming demo events.

## Production data hygiene

- OpenAI is parked with `ENABLE_KAIRO_AI=false`; its implementation remains preserved.
- Mock providers are no longer exported or referenced by production route/service graphs.
- Production dates are derived at runtime. Fixed dates remain only in deterministic tests/fixtures.
- `.env.local` remains ignored. Provider keys are server-only and are never logged, returned, bundled or committed.

## Verification

- ESLint: passed.
- TypeScript: passed.
- Vitest: 39 files, 129 tests passed.
- Production bundle scan: no configured credential value in client chunks, no mock provider/dataset or fixed reference date in app bundles, and no `yahoo-finance2` client import.
- Live smoke results: Massive auth/aggregates/market status OK; Massive snapshot/last-trade entitlement unavailable; FMP HTTP 429; Alpha auth/news response OK with subsequent quota limits.
- Production build: passed on Next.js 16.3.0 with all route types generated successfully.
- Browser-based local verification could not be executed from the current automation sandbox because localhost browser access was denied by its security policy; no bypass was attempted.
- Vercel Preview URL: pending branch push/deployment.

## Kairo AI

- Status: **PARKED / DISABLED**.
- Code preserved: **YES**.
- Future reactivation documented: **YES**, in `docs/FUTURE_KAIRO_AI.md`.
