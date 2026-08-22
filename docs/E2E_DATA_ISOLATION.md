# Deterministic E2E data isolation

Kairo has two intentionally separate financial-data verification layers. Playwright is a deterministic application gate; the live-provider smoke is an operational integration check. A temporary Yahoo, Massive, FMP, Finnhub or CoinGecko failure must never make an unrelated UI release test flaky.

## Root cause and dependency map

Before this isolation, `page.route()` mocked browser requests such as `/api/market/chart`, but it could not intercept work performed by React Server Components:

```text
Playwright browser
  -> Next.js instrument route
    -> server component / FinancialDataService
      -> FinancialProviderRouter
        -> Yahoo / Massive / FMP / EODHD
```

The chart scenario therefore still loaded quote and profile data from live providers during SSR. The global quote matrix also called the live router serially for every symbol, so upstream throttling accumulated until ETH-USD reached the existing 120-second test timeout.

## Deterministic Playwright layer

`playwright.config.ts` starts the local Next.js process with two private process variables:

```text
KAIRO_E2E_PROVIDER_FIXTURES=true
KAIRO_E2E_RUN=playwright
```

The server-only `DeterministicE2EProvider` is injected at `FinancialProviderRouter`, before provider cache, fallback and LKG lookup. It supplies canonical quote, profile, chart, history, fundamentals, calendar, news, macro and political contracts for the symbols used by the suite. Instrument resolution uses the same fixture source, so SEC and CoinGecko resolution cannot leak into SSR tests. The fixtures distinguish equities, ETFs, indexes and 24/7 crypto; BTC-USD and ETH-USD include weekend observations.

This mode is isolated from existing provider caches and persisted LKG state because fixture results are returned before live cache access. Cross-symbol data is keyed by canonical symbol and generated independently.

The Node instrumentation guard blocks recognized external financial-provider hosts when fixture mode is active. `/api/testing/provider-audit` exists only as a read-only test assertion: it returns 404 outside fixture mode and cannot activate the mode. The full deterministic suite asserts that blocked attempts remain zero.

## Production safety

Fixture mode cannot be selected by a URL, query string, cookie, request header or client-side environment variable. It requires both server process flags and fails closed whenever Vercel sets `VERCEL=1` or `VERCEL_ENV` for Preview or Production. No fixture flag is configured in Vercel and no secret is required. Normal provider routing is unchanged when the mode is off.

## Running deterministic E2E

```bash
npm run test:e2e
```

Playwright owns its local server and does not reuse an already-running development server, preventing stale process configuration. To exercise a previously built production server locally:

```bash
PLAYWRIGHT_SERVER_COMMAND="node node_modules/next/dist/bin/next start" npm run test:e2e
```

Run `npm run build` first for the second form.

## Running the live smoke

```bash
npm run test:live-provider-smoke
```

The live smoke explicitly refuses fixture mode. It queries one representative equity (NVDA), ETF (SPY) and crypto asset (BTC-USD), serially and through the production router. Each JSON line reports provider, symbol, latency, freshness, fallback/LKG use, rate-limit status and a `PASS`, `DEGRADED` or `FAIL` result without printing credentials.

- `PASS`: the live response satisfies the quote/chart and asset-class contracts.
- `DEGRADED`: upstream data is unavailable through a normalized provider error; this is an operational health result, not fake fresh data.
- `FAIL`: the application contract is invalid or an unexpected non-provider error occurred.

The deterministic E2E gate must be 100% green. Live smoke health is reported separately so upstream outages remain visible without being disguised as application failures.
