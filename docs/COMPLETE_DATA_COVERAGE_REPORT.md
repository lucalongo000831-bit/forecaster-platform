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

## Security

All provider clients are marked `server-only`. Credentials are read from the validated server environment and are sent only in upstream server requests. Client DTOs, health pages and lineage output contain provider names and freshness, never credentials or authenticated URLs. `ENABLE_KAIRO_AI=false` remains supported and no AI call is part of acquisition, build or normal runtime.
