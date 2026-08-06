# Kairo Market Intelligence

Kairo is a responsive financial-research frontend built with Next.js App Router. Market search, quotations, OHLCV charts, company profiles, selected fundamentals, and news metadata are loaded through `yahoo-finance2` exclusively on the server. The original visual system and routing remain independent of the source provider.

This project is an independent product concept. It does not scrape Yahoo pages, call the original reference site, embed iframes, or contain credentials.

## Stack

- Next.js 16, React 19, TypeScript, Tailwind CSS 4
- Recharts for visualizations
- `yahoo-finance2` 4.x for server-side financial data
- `FinancialDataProvider` as the stable UI/data contract
- `MockFinancialDataProvider` as a clearly labelled resilience fallback

## Run locally

Requirements: Node.js 20+ and npm 10+.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Production verification:

```bash
npm run lint
npm run typecheck
npm run build
npm run start
```

No environment variable or API key is required. Yahoo access is outbound server traffic and is never initiated by a browser component.

## Data architecture

```text
Server Component / internal API route
              │
              ▼
     FinancialDataProvider
              │
      YahooFinanceProvider
        │             │
        ▼             ▼
 yahoo-finance2   explicit mock /
  server only     unavailable fallback
```

Key locations:

```text
src/
├── app/api/market/                 Normalized Node.js API routes
├── components/charts/              Charts receiving typed props
├── components/financial/           Financial views and state UI
├── data/mock/                       Central demo/fallback dataset
├── lib/                             Formatting, routing, client API hooks
├── services/
│   ├── financial-data-provider.ts  Stable provider contract
│   ├── yahoo-finance-provider.ts   UI-facing Yahoo implementation
│   └── yahoo/                       Client, cache, retry, validation, analytics
└── types/                           Domain and API DTO types
```

`financial-data-service.ts` is the only provider-selection point. Components do not import Yahoo or raw mock datasets, and client components communicate only with same-origin `/api/market/*` routes.

## Server endpoints

All market routes use the Node.js runtime, validate inputs, return normalized DTOs, rate-limit per IP, and hide Yahoo cookies, headers, and endpoint details.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/market/search?q=` | Stocks, ETFs/funds, indices, currencies, crypto |
| `GET /api/market/quote?symbol=` | Current quote, daily change, OHLC, volume, market cap |
| `GET /api/market/chart?symbol=&range=&interval=` | Valid OHLCV points for 1D, 5D, 1M, 6M, YTD, 1Y, 5Y, MAX |
| `GET /api/market/profile?symbol=` | Company/instrument profile |
| `GET /api/market/fundamentals?symbol=` | Available normalized fundamental fields |
| `GET /api/market/news?symbol=` | Supported Yahoo news metadata and source links |

Symbols support dots, dashes, `^`, `=`, and exchange suffixes, including `BRK-B`, `^GSPC`, `BTC-USD`, `EURUSD=X`, `ENI.MI`, and `STLAM.MI`. Dynamic links URL-encode both market and symbol.

## Reliability

- Request timeouts range from 12 to 18 seconds, allowing Yahoo’s initial cookie handshake.
- One controlled retry is used only for timeouts, rate limits, and transient upstream failures.
- In-memory request coalescing prevents duplicate concurrent calls.
- Fresh/stale caches vary by data class: quotes 20s + 2m stale, search 5m + 30m stale, intraday charts 1m + 5m stale, long charts 15m + 6h stale, profiles 24h + 7d stale, fundamentals 6h + 48h stale, news 10m + 1h stale.
- API responses add `s-maxage`, `stale-while-revalidate`, and `stale-if-error` directives where live data is returned.
- Rate limits are per server instance: search 12/minute; other routes 20–30/minute per IP.
- Logs contain only operation, normalized symbol, and error category—never cookies, headers, IPs, or raw provider URLs.
- Fallback responses include `meta.source: "mock"` and `meta.fallback: true`; UI states label demo data.

For multi-instance production deployments, replace the in-memory cache and limiter with Redis/KV while retaining the same interfaces.

## Pages

Core routes include `/dashboard`, `/search`, `/calendar`, `/watchlists`, `/portfolio`, `/settings`, authentication screens, and every dynamic instrument workspace under:

```text
/instrument/[market]/[symbol]/overview
/instrument/[market]/[symbol]/chart
/instrument/[market]/[symbol]/seasonality
/instrument/[market]/[symbol]/pattern
/instrument/[market]/[symbol]/overbought-oversold
/instrument/[market]/[symbol]/fundamentals/{analysis,statements,ratios,transcripts}
/instrument/[market]/[symbol]/political
/instrument/[market]/[symbol]/news
```

## Real, calculated, demo, and unavailable data

- Real Yahoo data: search, quote, current OHLC/volume/market cap, historical OHLCV, profile fields, supported summary fundamentals, news metadata.
- Calculated from real closes: returns, drawdown, annual performance, seasonality, rolling pattern statistics, RSI/SMA momentum, and the watchlist signal.
- Explicit demo: personal portfolio, composite calendar, account/workspace preferences, editorial assistant content.
- Unavailable without another provider: political disclosures, full transcripts, proprietary fair values/scores, normalized product-segment revenue, complete macro calendar, and licensed article bodies.

Exact formulas and limitations are documented in [YAHOO_DATA_LIMITATIONS.md](YAHOO_DATA_LIMITATIONS.md). The implementation design is in [YAHOO_INTEGRATION_PLAN.md](YAHOO_INTEGRATION_PLAN.md).

## Security

`.gitignore` excludes `.env`, `.env.local`, dependency folders, build output, private keys, certificates, and common credential files. Do not commit secrets. Yahoo access currently requires none.

## Disclaimer

Market information may be delayed, incomplete, or unavailable. Demo data is explicitly marked and is not real market data. Calculated signals are descriptive statistics, not forecasts or financial advice.
