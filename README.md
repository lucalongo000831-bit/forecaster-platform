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
- Buy-side Company Intelligence with historical statement validation, earnings/FCF quality, evidence-based company scoring, moat and management analysis, reverse DCF, bear/base/bull DCF, downside-first risks, horizons through 20 years, operational calendar, PDF/CSV reports and point-in-time decision validation.
- Asset-specific Crypto, ETF and Index Intelligence, with technicals, risk, seasonality, attributed sentiment and probabilistic scenarios instead of inapplicable corporate DCF metrics.
- Global Markets risk monitoring with a versioned deterministic stress model, systemic-transmission rules, historical alert timeline and a separately labelled manual editorial brief workflow.
- Ask Kairo code is preserved but parked behind `ENABLE_KAIRO_AI=false`; the financial platform works without an OpenAI key.

## Technology

- Next.js 16.3 / React 19.2 / TypeScript 6 / Tailwind CSS 4
- Recharts 3 for accessible responsive charts
- Drizzle ORM and PostgreSQL
- Upstash Redis for distributed cache, locks and rate limiting
- `yahoo-finance2` used only in server-only modules
- Official `openai` SDK and Responses API used only in server-only modules
- Zod validation, bcrypt password hashes and HMAC-protected opaque sessions
- Vitest and Playwright

## Quick start

Requirements: Node.js 22+ and npm 10+.

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
| `npm run test:live-providers` | safe Massive/FMP/Alpha live smoke test; prints only OK/ERROR |
| `npm run test:company-smoke` | Company Intelligence symbol/archetype smoke matrix against a running app |
| `npm run test:openai` | minimal live Responses API authentication check; never prints the key or model output |

## Architecture

```text
Browser / React client components
        │ same-origin normalized APIs only
        ▼
Next.js server components + Node.js route handlers
        ├── authentication / ownership / CSRF / rate limits
        ├── financial provider router
        │     ├── Massive      primary US/crypto market data
        │     ├── Yahoo        global and unsupported-symbol fallback
        │     ├── FMP          fundamentals and calendars
        │     └── Alpha        attributed news sentiment
        ├── deterministic quant engines
        ├── Ask Kairo Responses API agent (parked by feature flag)
        │     ├── strict internal financial tools only
        │     ├── normalized context and provenance
        │     └── PostgreSQL conversation memory
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
- `src/ai`: server-only OpenAI client, versioned prompt, context, tool registry, cost controls and agent loop.
- `src/db`: PostgreSQL schema and migrations, including private Kairo conversation memory.

## API surface

Public market APIs include `/api/market/{search,quote,quotes,chart,profile,fundamentals,statements,analyst,news,status,events,political,macro}`, `/api/analysis/{technical,fundamental,seasonality,signal,targets,risk,forecast}`, `/api/intelligence/news`, `/api/calendar` and `/api/backtests`.

Global Markets is available at `/global-markets` with public normalized reads under `/api/global-risk/{current,history,components,triggers}` and `/api/global-market-brief/{current,history}`. Forced risk calculation and editorial draft/parse/publish/archive operations require an authenticated same-origin request and tighter rate limits.

Company Intelligence is available at `/instrument/[market]/[symbol]/analysis` and through `/api/company/resolve`, the section endpoints under `/api/company/[symbol]/**`, report export, refresh, custom DCF and decision backtesting. Public sections share one aggregate abuse budget and one cached report pipeline; costly mutations and production exports use tighter authentication/limit controls.

Private APIs include:

- `/api/auth/{register,login,logout,session}`
- `/api/account/watchlists/**`
- `/api/account/portfolios/**`
- `/api/account/alerts/**`
- `/api/account/notifications`
- `POST /api/ai/chat` (streamed NDJSON), `GET /api/ai/conversations` and `GET /api/ai/conversations/[id]`

## Ask Kairo status

Ask Kairo is disabled by default and does not require `OPENAI_API_KEY`. Its source, conversations and tools remain intact for future reactivation. Never paste a key into source code or chat. See [the reactivation guide](docs/FUTURE_KAIRO_AI.md).

If it is reactivated in a controlled environment, configure the key through hidden terminal input:

```bash
./scripts/configure-openai-key.sh
./scripts/configure-openai-model.sh gpt-5.6-sol
npm run db:migrate
npm run test:openai
```

Set `OPENAI_API_KEY` as Sensitive for Vercel Preview and Production. Vercel does not permit Sensitive variables in Development, so local development uses the ignored, mode-600 `.env.local` instead of weakening key visibility. Configure `OPENAI_MODEL` in each required environment. Ask Kairo requires an authenticated Kairo user and PostgreSQL because messages and tool audit records are user-owned. It sends only bounded conversation excerpts and normalized financial tool results to OpenAI; provider keys, session tokens, raw IPs, internal prompts, tool credentials and private chain-of-thought are never persisted or returned to the browser. See [Ask Kairo architecture](docs/KAIRO_AI.md).

Operational APIs:

- Public liveness: `GET /api/health`
- Protected diagnostics: `GET /api/health/providers`, `GET /api/health/database`
- Protected schedules: `GET /api/cron/daily`, `GET /api/cron/alerts`

All financial and operational route handlers use the Node.js runtime. Symbols are normalized and length-limited and support dots, dashes, `^`, `=` and exchange suffixes such as `BRK-B`, `^GSPC`, `BTC-USD`, `EURUSD=X`, `ENI.MI` and `STLAM.MI`.

## Data truth and provenance

Provider results include provider, fetch time, source time, freshness, quality and fallback metadata. Calculated outputs include model version, calculation time, data timestamp, completeness/confidence and limitations.

- `REALTIME`, `NEAR_REALTIME`, `DELAYED`, `CACHED`, `END_OF_DAY`, `STALE` and `UNAVAILABLE` are preserved separately.
- `CACHED`: a recent server-side provider observation.
- `ESTIMATE`: externally sourced or model-derived estimate.
- `MODEL OUTPUT`: deterministic calculation from documented inputs.
- `DEMO`: test/development fixtures only; production routes do not silently load mock financial values.
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
- [Company Intelligence operations](docs/COMPANY_INTELLIGENCE_OPERATIONS.md), [architecture](docs/COMPANY_INTELLIGENCE_ARCHITECTURE.md), [methodology](docs/COMPANY_ANALYSIS_METHODOLOGY.md) and [acceptance tests](docs/COMPANY_ANALYSIS_ACCEPTANCE_TESTS.md)
- [Acceptance tests](docs/ACCEPTANCE_TESTS.md)
- [Known data limits](docs/DATA_LIMITATIONS.md) and [Yahoo limits](YAHOO_DATA_LIMITATIONS.md)
- [Ask Kairo architecture, tools and operating limits](docs/KAIRO_AI.md)
- [Future Ask Kairo reactivation](docs/FUTURE_KAIRO_AI.md)
- [Massive streaming gateway](docs/REALTIME_GATEWAY_SETUP.md)
- [Live provider implementation report](docs/LIVE_PROVIDER_IMPLEMENTATION_REPORT.md)
- [Global Risk engine](docs/GLOBAL_RISK_ENGINE.md), [methodology](docs/GLOBAL_RISK_MODEL_METHODOLOGY.md), [data sources](docs/GLOBAL_MARKETS_DATA_SOURCES.md), [editorial workflow](docs/GLOBAL_MARKET_BRIEF.md) and [future editorial AI boundary](docs/FUTURE_AUTOMATED_EDITORIAL_AI.md)

## Disclaimer

Kairo is research software, not investment advice. Financial data can be delayed, partial or unavailable. Signals, forecasts, targets, risk plans and backtests are model outputs and do not promise future performance. Verify material information with a primary source or authorized execution venue before acting.
