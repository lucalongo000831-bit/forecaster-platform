# Kairo Market Intelligence

Kairo is an independent, full-stack financial research workspace built with Next.js 16 App Router, React 19 and TypeScript. It combines live server-side market data, deterministic quantitative models and private PostgreSQL-backed account features without exposing provider credentials to the browser.

The product identity and assets are replaceable. The project does not scrape the original reference site, embed it, copy its JavaScript bundles or depend on its backend.

## Capabilities

- Global search for equities, ETFs, funds, indices, FX and crypto, including international suffixes.
- Server-side quotes, OHLCV charts, profiles, fundamentals, statements, ratios, analyst targets, news and calendars.
- Technical indicators, multi-factor signals, market regime, seasonality, targets, DCF, risk plans and probabilistic forecasts.
- Point-in-time backtesting with fees, spread, slippage, next-session execution and explicit bias controls.
- Secure credentials authentication, HttpOnly sessions and per-user watchlists, portfolio ledgers, alerts and internal notifications.
- Multi-provider routing across Yahoo Finance, Financial Modeling Prep, Alpha Vantage and Massive, with typed adapters, timeout, retry, caching and fallback.
- Protected health endpoints, cron jobs, structured logs, request IDs, rate limiting and data provenance.

## Technology

- Next.js 16.3 / React 19.2 / TypeScript 6 / Tailwind CSS 4
- Recharts 3 for accessible responsive charts
- Drizzle ORM and PostgreSQL
- Upstash Redis for distributed cache, locks and rate limiting
- `yahoo-finance2` used only in server-only modules
- Zod validation, bcrypt password hashes and HMAC-protected opaque sessions
- Vitest and Playwright

## Quick start

Requirements: Node.js 20+ and npm 10+.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Public research pages work with Yahoo enabled and no credentials. Persistent account features intentionally return `NOT_CONFIGURED` until PostgreSQL and `AUTH_SECRET` are configured.

Minimum persistent setup:

```bash
# Set DATABASE_URL, DIRECT_DATABASE_URL, AUTH_SECRET and NEXT_PUBLIC_APP_URL
npm run db:migrate
npm run dev
```

Generate `AUTH_SECRET`, `CRON_SECRET` and `INTERNAL_API_SECRET` with a cryptographically secure password generator. Never paste values into tracked files.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | local Next.js development server |
| `npm run lint` | ESLint including Next.js and React rules |
| `npm run typecheck` | strict TypeScript check |
| `npm test` | deterministic unit and contract tests |
| `npm run test:e2e` | Playwright browser acceptance suite |
| `npm run build` | optimized production build |
| `npm run start` | run the production build |
| `npm run db:generate` | generate a migration from schema changes |
| `npm run db:migrate` | apply committed PostgreSQL migrations |
| `npm run test:providers` | optional live provider smoke test |

## Architecture

```text
Browser / React client components
        │ same-origin normalized APIs only
        ▼
Next.js server components + Node.js route handlers
        ├── authentication / ownership / CSRF / rate limits
        ├── financial provider router
        │     ├── Massive      market data when enabled
        │     ├── Yahoo        global market fallback
        │     ├── FMP          fundamentals and calendars
        │     └── Alpha        attributed news sentiment
        ├── deterministic quant engines
        └── account services / job runner
              ├── PostgreSQL durable state
              └── Redis cache, locks and distributed limits
```

Core boundaries:

- `src/providers`: typed server-only provider capabilities and routing.
- `src/engines`: pure, versioned calculations with unit tests.
- `src/services`: orchestration, persistence and provider-independent use cases.
- `src/app/api`: normalized same-origin APIs; no raw upstream payloads.
- `src/components`: presentation receives typed props or calls only internal APIs.
- `src/data/mock`: explicit, centralized demo fallback only; never personal data.
- `src/db`: 43-table PostgreSQL schema and migrations.

## API surface

Public market APIs include `/api/market/{search,quote,quotes,chart,profile,fundamentals,statements,analyst,news,status,events}`, `/api/analysis/{technical,fundamental,seasonality,signal,targets,risk,forecast}`, `/api/intelligence/news`, `/api/calendar` and `/api/backtests`.

Private APIs include:

- `/api/auth/{register,login,logout,session}`
- `/api/account/watchlists/**`
- `/api/account/portfolios/**`
- `/api/account/alerts/**`
- `/api/account/notifications`

Operational APIs:

- Public liveness: `GET /api/health`
- Protected diagnostics: `GET /api/health/providers`, `GET /api/health/database`
- Protected schedules: `GET /api/cron/daily`, `GET /api/cron/alerts`

All financial and operational route handlers use the Node.js runtime. Symbols are normalized and length-limited and support dots, dashes, `^`, `=` and exchange suffixes such as `BRK-B`, `^GSPC`, `BTC-USD`, `EURUSD=X`, `ENI.MI` and `STLAM.MI`.

## Data truth and provenance

Provider results include provider, fetch time, source time, freshness, quality and fallback metadata. Calculated outputs include model version, calculation time, data timestamp, completeness/confidence and limitations.

- `LIVE` / `DELAYED`: provider market observations.
- `CACHED`: a recent server-side provider observation.
- `ESTIMATE`: externally sourced or model-derived estimate.
- `MODEL OUTPUT`: deterministic calculation from documented inputs.
- `DEMO`: explicit mock fallback only when a feature permits it.
- `UNAVAILABLE`: no verified source or insufficient input; never silently fabricated.

Personal portfolio and watchlist values are never substituted with mock account records. Political disclosures, full call transcripts and verified geopolitical event feeds remain unavailable until an appropriate licensed source is configured.

## Security

- Provider imports and secrets remain in `server-only` modules.
- Cookies are HttpOnly, `SameSite=Lax`, scoped to `/`, and `Secure` in production.
- Writes require same-origin checks, Zod validation, body limits, rate limits and server-side ownership.
- Upstream fetches reject redirects, enforce timeout/retry policies and validate payload contracts.
- Structured logs sanitize fields and never include credentials, authorization headers or raw IPs.
- `.gitignore` excludes `.env*` except `.env.example`, private keys, credentials, dependencies and build output.
- CSP, frame denial, MIME sniffing prevention, referrer and permissions policies are configured in `next.config.ts`.

See [docs/SECURITY_MODEL.md](docs/SECURITY_MODEL.md) and [docs/VERCEL_SETUP.md](docs/VERCEL_SETUP.md).

## Deployment

Vercel must use the standard Next.js preset with the repository root containing `package.json`. Do not configure an Output Directory: `.next`, `public`, `dist`, `build` and `out` are incorrect manual overrides for this app. `vercel.json` declares only the framework and a daily Hobby-compatible cron.

Detailed environment, PostgreSQL, Redis, cron, preview and domain instructions are in [docs/VERCEL_SETUP.md](docs/VERCEL_SETUP.md). Provider costs and quotas are in [docs/COST_AND_RATE_LIMITS.md](docs/COST_AND_RATE_LIMITS.md).

## Documentation index

- [Architecture](docs/FINANCIAL_PLATFORM_ARCHITECTURE.md)
- [Database](docs/DATABASE_SCHEMA.md)
- [Provider routing](docs/PROVIDER_ROUTING.md) and [data matrix](docs/DATA_SOURCE_MATRIX.md)
- [Quant models](docs/QUANT_MODELS.md), [forecast](docs/FORECAST_ENGINE.md), [backtest](docs/BACKTEST_ENGINE.md)
- [Account features and alerts](docs/ACCOUNT_FEATURES.md)
- [Operations and cron](docs/OPERATIONS.md)
- [Acceptance tests](docs/ACCEPTANCE_TESTS.md)
- [Known data limits](docs/DATA_LIMITATIONS.md) and [Yahoo limits](YAHOO_DATA_LIMITATIONS.md)

## Disclaimer

Kairo is research software, not investment advice. Financial data can be delayed, partial or unavailable. Signals, forecasts, targets, risk plans and backtests are model outputs and do not promise future performance. Verify material information with a primary source or authorized execution venue before acting.
