# Company Intelligence operations

## Production boundary

Company Intelligence is a server-side orchestration layer. Browser components receive the serializable `CompanyIntelligenceReport`; they never import Yahoo Finance, FMP, Alpha Vantage, Massive, Redis or database clients. All public company endpoints use the Node.js runtime and preserve the standard Next.js output expected by Vercel.

The production path is:

```text
public page or /api/company route
  -> aggregate per-IP analysis budget
  -> normalized symbol
  -> six-hour report cache
  -> Next.js persistent data cache per symbol/model
  -> local single-flight per symbol
  -> Redis distributed lock per symbol
  -> provider router and partial-failure pipeline
  -> report cache
  -> optional append-only PostgreSQL snapshot
```

## Availability and concurrency

- Every public report/section consumes the same `company:analysis` budget: 12 requests per minute per privacy-hashed IP.
- Report export also has a five-per-five-minute budget. CSV and PDF require an authenticated session in production.
- Refresh, custom DCF and decision backtests retain independent, stricter authenticated budgets.
- Concurrent requests for one normalized symbol share one promise in a Node.js process.
- The Next.js data cache shares completed report results across route/page bundles and requests for six hours; an explicit refresh expires the matching symbol tag immediately.
- With Redis configured, only one instance builds a report for a symbol/model version at a time. Other instances poll the report cache for up to 15 seconds and return a retryable controlled error instead of duplicating provider work.
- The distributed lock expires after 90 seconds so crashed work cannot block a symbol indefinitely.
- Every company route declares a 30-second Vercel function duration. Heavy bulk ingestion belongs in a queue or dedicated worker, not a request handler.

Production must configure Upstash Redis. The bounded memory cache, rate limits and single-flight fallback are suitable for local development and a single process only.

## Cache policy

| Data | Fresh policy | Stale/fallback behavior |
| --- | ---: | --- |
| quote | 15–60 seconds | provider stale window, then controlled unavailable state |
| intraday/daily outlook | 1–5 minutes | partial report with limitation |
| news | 5–15 minutes | persisted/provider stale result when available |
| technical and seasonality | 15 minutes–1 hour | cached historical computation |
| profile, statements, fundamentals, analyst data | 6–24 hours | alternate provider or explicit unavailable stage |
| complete company report | 6 hours | CDN SWR for 24 hours; refresh invalidates the report key |

Provider results are cached separately from the report. A partial provider failure does not discard successful stages and never converts a missing value to zero.

## Security invariants

- Provider credentials stay in server-only environment variables and sanitized logs.
- Provider profile links are canonicalized at the provider-to-domain boundary. Only credential-free HTTPS URLs are rendered; all other values become `null`.
- CSV strings beginning with optional whitespace plus `=`, `+`, `-` or `@` are prefixed with a literal apostrophe before RFC-style quoting. Numeric negative values remain numeric.
- Public report computation has one aggregate request budget, independent of which section is returned.
- Instrument classification fails closed: explicit ETF/fund/index/crypto/FX/future types and canonical non-company symbol forms stop after quote/profile and never trigger the corporate fan-out.
- Provider news and profile text is data, never executable instructions.
- PDF output escapes PDF string metacharacters and replaces unsupported control/non-ASCII characters in the minimal built-in exporter.

## Provider and fallback matrix

| Capability | Preferred source | Fallback | Honest unavailable state |
| --- | --- | --- | --- |
| global quote/chart/profile | configured market provider | Yahoo, then enabled provider fallback | provider error envelope or partial report |
| statements and fundamentals | FMP when entitled | Yahoo modules where available | `DATO NON DISPONIBILE` with reduced confidence |
| attributed news | Alpha Vantage when configured | Yahoo news | empty/partial news stage, never generated facts |
| technical, seasonality, DCF and scores | deterministic local engines | none | model output omitted when required inputs are absent |
| private snapshots/reports | PostgreSQL | no personal-data mock | persistence unavailable while public analysis continues |
| distributed cache/limits | Upstash Redis | bounded process memory in development | production configuration warning/health signal |

`ENABLE_MOCK_FALLBACK` remains disabled by default. Any enabled demo result must retain explicit demo provenance and must not be presented as live financial data.

## Cost model

Exact monetary costs cannot be stated without the operator's provider and hosting plans. Estimate monthly cost with:

```text
provider cost = billable provider calls after cache x contracted unit price
Vercel cost   = function invocations + duration + bandwidth above plan allowance
Redis cost    = cache/lock/rate-limit REST operations above plan allowance
database cost = retained snapshot bytes + compute + connections above plan allowance
```

Monitor these counters separately: report cache misses, provider calls by capability/provider, 429/5xx rates, distributed-lock contention, report duration percentiles, snapshot insertions and bytes retained. Increase refresh frequency only after comparing those counters with provider dashboard quotas.

## Smoke and acceptance matrix

The live smoke runner covers these equity symbols: AAPL, MSFT, NVDA, AMZN, META, GOOGL, TSLA, DUOL, NOW, RKLB, STLAM.MI and ENI.MI. It also covers JPM (bank), ALL (insurance), NEE (utility), F (cyclical), RIVN (loss-making/negative FCF), CCL (high debt), ARM (recent listing), SPY (ETF), `^GSPC` (index), BTC-USD (crypto) and an unknown ticker.

Run against an already started local or preview deployment:

```bash
npm run test:company-smoke
COMPANY_SMOKE_STRICT=true npm run test:company-smoke
```

Default mode accepts only normalized success responses or documented, structured provider/availability errors. Strict mode requires every supported instrument to return a complete successful contract and should be used in a provider-enabled staging environment.

## Deployment checklist

1. Apply committed database migrations from a trusted job; never during `next build`.
2. Configure Production and Preview environments separately.
3. Set `DATABASE_URL`, `DIRECT_DATABASE_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL` and `NEXTAUTH_URL` for persistent account/report features.
4. Set both Upstash variables for distributed production coordination.
5. Enable only provider capabilities included in the contracted plans.
6. Leave Vercel Output Directory empty and use the standard Next.js preset.
7. Run lint, typecheck, unit/integration tests, Playwright, production build and the strict company smoke test against Preview.
8. Verify CSV/PDF authentication, provider attribution, partial-data rendering, unknown ticker handling and non-company `NON APPLICABILE` states.
9. Inspect provider quota, lock contention, duration and error-rate dashboards before promoting Preview to Production.

## Failure drills

- **Yahoo unavailable:** disable or block Yahoo in a non-production environment, confirm alternate enabled providers are attempted, and confirm the API returns either a partial sourced report or a structured retryable error.
- **Redis unavailable:** local development must continue with bounded memory; production health must flag the loss of distributed coordination before traffic is increased.
- **Database unavailable:** public analysis may render, while report saving and historical validation return controlled persistence errors.
- **Provider returns hostile URL/text:** URL tests must reject non-HTTPS/credential-bearing destinations; React must continue to render text without raw HTML.
- **Concurrent cold requests:** verify one report build per symbol/model generation across page/API bundles, and at most one snapshot insertion from that generation.
