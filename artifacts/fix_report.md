# Company Intelligence security remediation report

Baseline review: `d8e4661_20260807T091139Z` (branch-diff security scan through milestone 13).

## Finding 1 — public section endpoints amplify full provider work

Status: fixed.

- All public Company Intelligence sections, the SSR analysis page and report reads consume the same `company:analysis` per-IP budget.
- A six-hour Next.js data-cache entry, process-local single-flight and optional Redis distributed lock coordinate report generation per normalized symbol/model.
- Explicit refresh expires both the report cache and the matching Next.js cache tag.
- ETF, fund, index, crypto, FX and future classification fails closed after quote/profile resolution, before statements, news, technical, DCF and seasonality fan-out.
- Every Company Intelligence route has a bounded 30-second function duration; report export has an additional stricter budget and production authentication for CSV/PDF.

Regression evidence: aggregate-budget unit test, single-flight unit tests, non-company classification unit tests, desktop/mobile Company Intelligence E2E and 23-case live smoke matrix.

## Finding 2 — CSV spreadsheet formula injection

Status: fixed.

String cells beginning with optional whitespace followed by `=`, `+`, `-` or `@` receive an apostrophe prefix before RFC-style CSV quoting. Negative numeric values remain numeric. Regression cases cover every trigger plus tab, carriage return, leading spaces, quotes, commas and line breaks.

## Finding 3 — unsafe company profile source URL

Status: fixed.

Provider-derived links are normalized at the service boundary. Only credential-free `https:` URLs are retained. HTTP, script/data/file schemes, relative/invalid URLs and URLs containing credentials become `null`. Rendered external links retain `noopener noreferrer`.

## Additional hardening discovered during verification

- FMP ETF classification now reads the provider boolean correctly.
- Required quote-stage failures preserve the original provider error, so upstream outages/rate limits remain retryable structured errors instead of becoming a misleading ticker 404.
- Provider/adaptor versions and principal data-family provenance are included in report contracts and exports.
- Playwright outputs are excluded from lint scope and remain ignored by Git.

## Verification

- `npm audit --omit=dev`: 0 production vulnerabilities.
- Secret signature scan: no embedded credential/private-key signature found; `.env.local` remains ignored and only `.env.example` is tracked.
- `yahoo-finance2`: imported only from the `server-only` Yahoo client.
- `npm test`: 35 files, 112 tests passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed with the standard Next.js 16.3 Vercel output.
- `npm run test:e2e`: 16/16 desktop/mobile tests passed while upstream providers also exercised timeout/rate-limit fallback paths.
- `npm run test:company-smoke`: 23/23 cases passed, including international equities, sector archetypes, ETF, index, crypto and unknown ticker.
- Yahoo-disabled production check: market quote returned an explicitly attributed demo fallback; Company Intelligence refused to fabricate a company report and returned a structured retryable provider-rate error.

## Residual operational dependency

Production should configure Upstash Redis for fleet-wide rate limiting and distributed cold-build locking. Without Redis, the persistent Next.js report cache and per-process controls remain active, but fleet-wide guarantees depend on the hosting cache topology.
