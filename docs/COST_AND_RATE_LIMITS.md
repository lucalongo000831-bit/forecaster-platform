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
- Alpha Vantage and Massive outbound adapters default to four calls per minute until plan-specific quotas are configured.
- backtests, AI classification and bulk jobs require authentication and explicit concurrency caps.
- every public Company Intelligence page/section shares one 12 requests/minute/IP analysis budget; response sections do not receive independent provider budgets.
- complete company reports use the persistent Next.js data cache, local single-flight and a Redis lock per normalized symbol/model version to avoid concurrent cold-cache fan-out across page, API and multi-instance execution.
- company CSV/PDF export is limited to five requests per five minutes and requires authentication in production.

Provider 429 responses propagate a retryable category and `Retry-After` without automatic retry storms. Cache keys include provider, instrument, market, timeframe/range, schema and model version.

See `docs/COMPANY_INTELLIGENCE_OPERATIONS.md` for the measurable monthly-cost formula and deployment counters. Exact euro/dollar estimates require the contracted provider, Vercel, Redis and database prices and are intentionally not fabricated in the repository.
