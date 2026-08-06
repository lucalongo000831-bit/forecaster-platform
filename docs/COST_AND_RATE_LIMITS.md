# Cost and rate limits

Exact quotas depend on provider plans and must be read from account dashboards; code treats them as configuration rather than assumptions.

| Service | Cost driver | Control |
| --- | --- | --- |
| Yahoo | unofficial upstream availability | cache, batch quotes, bounded concurrency |
| FMP | endpoint entitlement and request volume | feature detection, 12–24h fundamentals cache |
| Alpha Vantage | strict per-minute/day request quota | serialized throttling, persisted deduplicated news |
| Massive | realtime/intraday entitlement and calls | provider router, market-aware polling |
| PostgreSQL | storage, compute, connections | pooled URL, retention, indexes, batched upserts |
| Redis | request volume and stored bytes | compact keys, TTL, no unbounded payloads |
| Vercel | functions, duration, bandwidth, cron | CDN cache, payload limits, daily Hobby jobs |
| OpenAI (optional) | tokens/requests | disabled by default, dedupe/cache, strict length limit |

## Default application budgets

- quotes: 15–60 seconds; intraday: 1–5 minutes; daily charts: 15–60 minutes.
- profiles: 24 hours; fundamentals/analysts: 12–24 hours; news: 5–15 minutes.
- anonymous search and quote routes use conservative per-minute limits.
- backtests, AI classification and bulk jobs require authentication and explicit concurrency caps.

Provider 429 responses propagate a retryable category and `Retry-After` without automatic retry storms. Cache keys include provider, instrument, market, timeframe/range, schema and model version.
