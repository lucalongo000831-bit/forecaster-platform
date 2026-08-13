# KAIRO Provider Matrix V2

| Dataset | Primary | Official | Secondary/fallback | Fresh TTL | Ingestion | LKG policy |
| --- | --- | --- | --- | --- | --- | --- |
| Market quotes/charts | Massive / Yahoo router | Exchange-dependent | Yahoo/FMP | existing policy | market refresh | latest stored snapshot |
| Earnings | existing event router | issuer IR when automatable | Finnhub/FMP/EODHD | 6h | Calendar job | 30d |
| Dividends | existing event router | issuer/exchange when automatable | Massive/FMP/EODHD/Yahoo | 6h | Calendar job | 90d |
| US macro | FRED | FRED/BLS/BEA/EIA/Treasury | configured macro provider | 6h | `economic`, `calendar` | 30d |
| EU macro | ECB / Eurostat adapters | ECB/Eurostat | none silently substituted | 12h | registry-driven | 30d |
| Political House | Clerk bulk documents | US House Clerk | FMP normalized feed | 6h | `political` | indefinite with stale flag |
| Political Senate | FMP normalized feed | Senate only where automatable | no anti-bot bypass | 6h | `political` | indefinite with stale flag |
| Positioning | CFTC PRE | CFTC | none | 6h | Friday weekly | 18 months |
| Global news | Marketaux | issuer/SEC events where applicable | Alpha Vantage/FMP | 15m | `news` | 7d |
| Identity | OpenFIGI + GLEIF | GLEIF/SEC | existing resolver | 30d | on mapping miss/backfill | 180d |

Unknown vendor quotas are disabled in `providerQuotaPolicies` until verified. Runtime request counts and circuit state remain centralized.
