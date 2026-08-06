# Financial platform architecture

## Principles

The UI remains independent from providers. Every displayed value carries provenance, freshness and quality metadata. Provider responses are normalized before reaching services or engines. Calculations are deterministic, versioned and reproducible. User state is stored transactionally in PostgreSQL.

```text
Browser
  -> Next.js Server Components / internal Route Handlers
     -> authorization + Zod validation + request context
        -> application services
           -> provider router -> Yahoo / FMP / Alpha Vantage / Massive
           -> quantitative engines
           -> repositories -> PostgreSQL
           -> cache/locks/rate limits -> Redis (memory fallback in development)
```

## Layers

- `src/providers`: isolated external adapters and normalized contracts.
- `src/services`: orchestration, permissions, cache policies and fallbacks.
- `src/repositories`: database access only; no UI/provider logic.
- `src/engines`: pure quantitative functions with model versions.
- `src/schemas`: Zod request, response and environment schemas.
- `src/lib`: request context, logging, security, time and generic utilities.
- `src/jobs`: idempotent refresh/calculation/evaluation jobs.
- `src/app/api`: thin HTTP transport layer.

## Provider routing

| Domain | Primary | Fallback | Notes |
| --- | --- | --- | --- |
| Instrument search/international symbols | Yahoo | FMP | Yahoo remains replaceable and unofficial |
| Current US quote/intraday | Massive | Yahoo, FMP | Entitlement and market status determine freshness |
| Long historical chart | Yahoo | Massive | Normalize adjusted OHLCV |
| Statements/fundamentals/analysts | FMP | Yahoo summary | Feature detection prevents plan errors from cascading |
| News sentiment/macro | Alpha Vantage | Yahoo metadata | Persist and deduplicate normalized articles |
| Political disclosures | none | unavailable | Never synthesize transactions |

## Runtime boundaries

- Provider, database, secret, model and job modules are `server-only`.
- Financial routes use Node.js runtime.
- Client Components fetch only internal APIs.
- Persistent streaming is outside Vercel Functions; near-realtime uses internal polling.
- Redis and PostgreSQL are optional only for read-only market browsing; persistence endpoints return controlled availability errors until configured.

## Data envelope

Normalized results include `provider`, `sourceTimestamp`, `fetchedAt`, `freshness`, `quality`, `isDelayed`, `isFallback`, optional `modelVersion`, and warnings. UI badges map these fields to LIVE, DELAYED, CACHED, ESTIMATE, MODEL OUTPUT, DEMO or UNAVAILABLE.

## Failure behavior

Recoverable provider failures use bounded exponential backoff and stale data. Non-recoverable authorization/plan/not-found errors do not retry. Mock fallback is permitted only when explicitly enabled and is always labelled. Missing financial facts remain `null`, never zero.
