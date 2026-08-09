# Complete data coverage implementation

## Architecture delivered

- Server-only adapters for EODHD, Finnhub, CoinGecko and SEC EDGAR, alongside Massive, FMP, Alpha Vantage and Yahoo.
- Central request coordination with per-provider concurrency/request budgets, controlled retry, timeouts and circuit state.
- Issuer/listing separation and provider-symbol mappings, including SEC CIK and CoinGecko IDs.
- Normalized company, ETF and crypto data bundles with field-level provenance and explicit missing-data reasons.
- EODHD and SEC statement fallbacks wired into the existing fundamentals router.
- CoinGecko crypto structure and Finnhub ETF structure connected to the existing intelligence presentation.
- Protected `/preferences/data-lineage` diagnostics and expanded provider-health diagnostics.
- Additive database models for issuers, bundle snapshots and field-level lineage.

## Deterministic formulas

- Free cash flow: `operatingCashFlow - abs(capitalExpenditure)`.
- Net debt: `totalDebt - cash`, only with matching period/currency.
- Profit margin: `netIncome / revenue`.
- Return on equity: `netIncome / equity` with the available reported period.
- Price and forecast statistics continue to use the documented historical-return engines. No generative model is used.

## Provider coverage matrix

| Feature | Primary | Secondary / fallback | Kairo calculation | Coverage and limitations |
|---|---|---|---|---|
| Current market data and OHLCV | Massive | Yahoo, FMP, EODHD | change, freshness and technical metrics | Venue entitlements can make the result delayed. |
| Company identity and listing | FMP | EODHD, SEC, Yahoo | issuer/listing/provider-symbol reconciliation | Global identifiers remain provider-dependent. |
| US financial statements | SEC EDGAR | FMP, EODHD, Yahoo | normalized annual/quarterly periods, FCF and net debt | SEC concept aliases are reconciled across taxonomy changes. |
| European statements | EODHD / FMP | ESEF when enabled, Yahoo | currency-normalized periods | EODHD fundamentals are plan-restricted on the current account; ESEF coverage is partial. |
| Analyst consensus and peers | FMP | EODHD, Finnhub | target separation and peer metrics | History/revisions vary by plan. |
| Insider activity | SEC Form 4 | Finnhub, FMP | direction, concentration and management evidence | Non-US disclosure coverage varies. |
| Dividends and events | FMP | EODHD, Yahoo | dividend analytics | Calendar and history endpoints remain plan/rate dependent. |
| News and sentiment | Alpha Vantage | FMP, Yahoo | aggregation only over attributed articles | Strict request budgets and short-lived cache. |
| ETF structure and holdings | Finnhub | FMP / Yahoo metadata | holdings normalization | UCITS and some venue coverage are plan dependent. |
| Crypto fundamentals | CoinGecko | Yahoo / Massive market data | supply, ATH, volatility, seasonality and forecast presentation | No on-chain metrics are inferred. |
| DCF and Reverse DCF | normalized statements | market and analyst inputs above | deterministic five-year scenarios and bounded reverse equation | Unavailable only when positive FCF, diluted shares or valid assumptions are missing. |

## Acceptance evidence

- NVIDIA SEC taxonomy migration is covered by a regression test: successor concepts are merged instead of discarding newer filings.
- The current NVIDIA annual period resolves revenue, diluted shares, operating cash flow, capex and calculated FCF, enabling DCF and Reverse DCF.
- Market capitalization falls back to verified fundamentals when the selected market-data quote does not carry it.
- Missing inputs remain explicit and are not replaced with demo values.

## Security

All provider clients are marked `server-only`. Credentials are read from the validated server environment and are sent only in upstream server requests. Client DTOs, health pages and lineage output contain provider names and freshness, never credentials or authenticated URLs. `ENABLE_KAIRO_AI=false` remains supported and no AI call is part of acquisition, build or normal runtime.
