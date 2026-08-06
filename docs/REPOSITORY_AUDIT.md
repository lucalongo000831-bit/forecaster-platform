# Repository audit

Audit date: 2026-08-06. Repository: `lucalongo000831-bit/forecaster-platform`, branch `main`.

## Baseline

- Next.js 16.3 App Router, React 19, TypeScript strict, Tailwind CSS 4 and Recharts.
- Production command: `npm run build` (`next build --webpack`). Baseline build passes.
- Vercel uses the Next.js framework preset. Neither `vercel.json` nor `next.config.ts` overrides the output directory.
- The application has 29 page/route entries and six internal market-data route handlers.
- `yahoo-finance2` is imported once, from a module protected by `server-only`; Client Components call only same-origin APIs.
- FMP, Alpha Vantage and Massive credentials are local/Vercel server secrets. Minimal connectivity tests pass.
- No database, ORM, durable cache, job queue or real authentication exists at baseline.

## Page inventory

| Area | Routes | Baseline state |
| --- | --- | --- |
| Authentication | `/login`, `/register` | UI-only redirect; no accounts or sessions |
| Workspace | `/dashboard`, `/search`, `/calendar` | Search/quotes partly real; portfolio/signals/calendar partly demo |
| User data | `/watchlists`, `/portfolio`, `/settings` | Browser state or mock; not persistent |
| Instrument | `/instrument/[market]/[symbol]/*` | Real quote/history/profile; mixed calculated/unavailable/demo sections |
| Fundamentals | `analysis`, `statements`, `ratios`, `transcripts` | Limited Yahoo summary; no full statements/transcripts |
| Intelligence | `seasonality`, `pattern`, `overbought-oversold`, `political`, `news` | Basic calculations/news; political unavailable |

## Existing provider and API inventory

- `FinancialDataProvider` is the UI-facing contract.
- `YahooFinanceProvider` composes Yahoo data and an explicit `MockFinancialDataProvider` fallback.
- Yahoo supports search, single/batch quote, chart, profile, summary fundamentals and news metadata.
- In-memory cache supports fresh/stale windows and request coalescing, but not distributed deployments.
- In-memory rate limiting is per process and therefore insufficient across Vercel instances.
- Current API errors lack request IDs and standardized retry metadata.

## Mock and unavailable inventory

The centralized dataset in `src/data/mock/dataset.ts` contains fictional brand-support data, a fictional instrument, watchlist, portfolio, calendar, fundamentals, political trades, transcripts and news. Mock values currently enter the UI only as explicitly labelled fallback/demo data. Sections still requiring replacement are:

- personal portfolio, watchlists, settings and authentication;
- composite calendar and historical signal snapshots;
- complete statements, analyst estimates/ratings/targets and corporate actions;
- political disclosures, geopolitical exposure and AI summaries;
- full technical engine, fundamental score, risk plan, forecast and backtest;
- alert persistence and background evaluation.

## Quality and security findings

1. `auth-form.tsx` contains a demo password default and performs no authentication.
2. `instrumentPath` does not URL-encode route segments; the provider resolver does.
3. some calculated fundamentals replace missing values with zero, contrary to financial-data semantics.
4. client retries have no backoff and route rate limits omit `Retry-After`.
5. logs are safe but not structured around a request/correlation ID.
6. no Content Security Policy or explicit security header set exists.
7. provider cache and rate limiting are process-local.
8. there is no test runner, unit suite or integration suite at baseline.

## Baseline acceptance result

`npm run build`: PASS. No pre-existing build error was recorded. The baseline is deployable but not yet a persistent financial platform.
