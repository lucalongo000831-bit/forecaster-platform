# Company Intelligence acceptance tests

## Functional flow

1. Search by company name or ticker and select a verified result.
2. Open `/instrument/[market]/[symbol]/analysis` without entering personal financial data.
3. Show verdict, score, current price, scenarios, confidence, provider and timestamp above the fold.
4. Expand financials, earnings quality, quality, moat, management, peers, valuation, DCF, horizons, seasonality, risks, catalysts and sources.
5. Preserve missing data as **DATA NOT AVAILABLE** and unsupported corporate sections as **NOT APPLICABLE**.
6. Export a source-linked report and metric CSV; print uses a clean layout.

## Symbols and instrument classes

Equity coverage: AAPL, MSFT, NVDA, AMZN, META, GOOGL, TSLA, DUOL, NOW, RKLB, STLAM.MI and ENI.MI. Validation scenarios include financials, insurers, utilities, cyclicals, loss-making/negative-FCF/high-debt/new listings and non-USD equities.

ETF, index, crypto, forex and fund cases must resolve but return corporate sections as not applicable. An unknown ticker must produce a controlled 404/empty state. Non-company classification stops after quote/profile resolution and does not call statements, analyst, news, technical, DCF or seasonality stages.

## Quantitative invariants

- No `NaN`, infinity or missing-to-zero coercion in the API payload.
- Bear/base/bull values are ordered or explicitly warned.
- DCF rejects invalid instrument types and incompatible assumptions.
- Reverse DCF reports unavailable when no bounded solution exists.
- Long-horizon ranges widen and never present deterministic certainty.
- Scores remain 0–100; changing weights requires a model-version change.
- A short verdict cannot be generated from valuation alone.
- Historical backtests use only information available at each decision timestamp.

## Reliability and security

- Provider imports remain server-only and no secret appears in browser assets or logs.
- GET routes have cache policy, per-IP limits, correlation IDs and standardized errors.
- Refresh, DCF, export and backtest have tighter limits and authentication where required.
- Partial provider failure still renders successful sections and records limitations.
- Lint, typecheck, unit/integration tests, production build and desktop/mobile E2E pass.
- Vercel uses the standard Next.js preset with no output directory override.

## Automated evidence

- `npm test` covers scoring, statement validation, earnings quality, history, horizons, macro/news, outlook, qualitative analysis, risk register, valuation, verdict, report export and decision validation.
- `npm run test:e2e` exercises search/navigation, instrument research, Company Intelligence rendering, PDF export, non-company applicability, controlled provider errors and desktop/mobile layouts.
- `npm run test:company-smoke` exercises the complete symbol/archetype matrix with structured availability handling.
- `COMPANY_SMOKE_STRICT=true npm run test:company-smoke` is the provider-enabled staging gate: supported symbols must return a valid report instead of a fallback error.
- Security regressions cover aggregate company-analysis budgeting, local single-flight, spreadsheet formula prefixes and credential-free HTTPS source links.
- Report contracts expose model, scoring, valuation, signal, report and provider-adapter versions together with source/data timestamps.

The exact latest command results belong in the release/commit handoff. Documentation does not convert a skipped or provider-degraded check into a passing check.
