# Data source matrix

| Capability | Direct source | Calculated/persisted | Fallback | Availability rule |
| --- | --- | --- | --- | --- |
| Search | Yahoo | normalized instrument registry | FMP | stocks, ETFs, funds, indices, FX, crypto |
| Quote/OHLCV | Massive/Yahoo | quote snapshots and bars | FMP or stale | disclose realtime/delayed/cached |
| Corporate profile | FMP | company profile | Yahoo | fields remain nullable |
| Statements | FMP | versioned annual/quarterly rows | unavailable | entitlement detected per endpoint |
| Ratios/key metrics | FMP | fundamental engine | Yahoo summary | no zero substitution |
| Analyst estimates/ratings/targets | FMP | snapshots/dispersion | unavailable | provider timestamp required |
| Dividends/splits | Yahoo/FMP | corporate actions | unavailable | adjusted and raw series kept distinct |
| Earnings calendar | FMP | event rows | unavailable | known events, not predictions |
| Ticker news | Alpha Vantage/Yahoo | deduplicated news records | stale | source URL always retained |
| Macro indicators/news | Alpha Vantage | macro events | unavailable | respect free-plan throttling |
| Technical indicators | historical bars | deterministic engines | unavailable | minimum observations enforced |
| Seasonality | adjusted historical bars | deterministic engine | unavailable | 1Y marked descriptive |
| Signals | engine inputs | versioned snapshots | unavailable | insufficient quality suppresses signal |
| Targets | analyst + engines | versioned snapshots | unavailable | analyst/technical/fundamental/composite separated |
| Forecast | adjusted returns | bootstrap/Monte Carlo | unavailable | probabilistic percentiles only |
| Political trades | specialist provider needed | none | unavailable | never infer or mock as real |
| Geopolitical exposure | sourced news/profile | qualitative model | unavailable | confidence and sources required |
| Watchlists/portfolios/alerts | user input | PostgreSQL | unavailable | authenticated ownership required |
| Backtests | bars + point-in-time inputs | PostgreSQL | unavailable | no look-ahead, costs included |

## Quality scale

- `VERIFIED`: schema-valid provider data with a source timestamp.
- `PARTIAL`: valid but incomplete provider data.
- `STALE`: expired fresh TTL but inside stale-if-error window.
- `ESTIMATED`: transparent deterministic/model output.
- `DEMO`: fictional fallback, never mixed into production analytics.
- `UNAVAILABLE`: requirements or entitlement are not met.
