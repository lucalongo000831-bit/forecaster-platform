# Financial provider routing

The application never calls external financial providers from a Client Component. All credentials are read by server-only adapters and all browser traffic terminates at internal `/api/market/*` routes.

## Routing order

| Domain | Preferred adapter | Fallbacks | Notes |
| --- | --- | --- | --- |
| Global search | Yahoo | Massive, FMP | Yahoo covers international suffixes, indices and crypto. |
| Quote and bars | `MARKET_DATA_PRIMARY_PROVIDER` | configured fallback, Yahoo, FMP | Massive is used only for supported US symbols. |
| Profile and fundamentals | FMP | Yahoo | FMP feature detection handles subscription restrictions. |
| Statements, ratios, analyst consensus, earnings | FMP | unavailable | Values remain absent if the endpoint is not entitled. |
| Ticker news and sentiment | Alpha Vantage | Yahoo | Yahoo provides headlines but not normalized sentiment. |
| US market status | Massive | Yahoo | The result carries realtime/delayed/cached metadata. |

Every successful result includes provider, fetch/source timestamp, freshness, quality and fallback state. The provider cache supports fresh and stale windows in Upstash Redis when configured and a bounded local cache during development. Public routes add compatible CDN `stale-while-revalidate` policies.

## Reliability and safety

- External requests have an abort timeout and at most one bounded retry with exponential backoff.
- 4xx authentication/entitlement failures are not retried.
- Outbound quotas use global server-side throttles; IP-based inbound quotas use privacy-safe hashed identifiers.
- URLs are constructed from fixed environment base URLs and fixed adapter paths. User input is only accepted as validated query parameters.
- Redirects are rejected and provider response bodies are validated with Zod before mapping.
- Logs contain the provider, operation, duration, status and error code, never URLs or credentials.
- A missing ticker is definitive and is not silently converted to a real-looking mock response.
- Demo fallbacks are returned only with `provider=mock`, `fallback=true`, `quality=unavailable` and `no-store`.

## Provider limits

- Yahoo Finance is an unofficial, replaceable data source and may be delayed or unavailable.
- FMP endpoint access depends on the subscription. Connectivity does not imply entitlement to statements, analyst targets or calendars.
- Alpha Vantage is throttled conservatively to four calls per minute and may return a plan/rate message inside a successful HTTP response.
- Massive is throttled conservatively to four calls per minute. The adapter covers US stocks; streaming is deliberately not attempted inside Vercel Functions.
- Realtime labeling for Massive is enabled only with `ENABLE_REALTIME_DATA=true` after confirming the account entitlement.

Official provider documentation:

- FMP stable API: https://site.financialmodelingprep.com/developer/docs/stable
- Alpha Vantage API: https://www.alphavantage.co/documentation/
- Massive REST API: https://massive.com/docs/rest

Provider redistribution and storage terms must be verified against the active commercial plans before enabling public production redistribution.
