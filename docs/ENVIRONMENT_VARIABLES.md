# Environment variables

Real values belong only in `.env.local` and encrypted deployment settings. `.env.example` contains safe placeholders/defaults.

## Server-only

| Variable | Required when | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | persistent features | pooled PostgreSQL connection |
| `DIRECT_DATABASE_URL` | migrations | direct PostgreSQL connection |
| `AUTH_SECRET` | authentication | signs session tokens; minimum 32 characters |
| `NEXTAUTH_URL` | production authentication | canonical auth origin |
| `FMP_API_KEY`, `FMP_BASE_URL` | FMP adapter | fundamentals/analyst/corporate data |
| `ALPHA_VANTAGE_API_KEY`, `ALPHA_VANTAGE_BASE_URL` | Alpha adapter | news sentiment and macro data |
| `MASSIVE_API_KEY`, `MASSIVE_BASE_URL`, `MASSIVE_WEBSOCKET_URL` | Massive adapter | REST market data and optional streaming gateway |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | AI news flag | optional structured classification only |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | distributed operation | cache, locks and rate limits |
| `CRON_SECRET` | cron routes | scheduler authentication |
| `INTERNAL_API_SECRET` | detailed health/internal routes | internal bearer secret |
| `SENTRY_DSN` | monitoring | server error reporting |

Provider secrets must never have a `NEXT_PUBLIC_` prefix. Base URLs are validated against HTTPS/WSS and adapters still enforce an allowlist.

## Browser-safe

- `NEXT_PUBLIC_APP_URL`: canonical public application URL.
- `NEXT_PUBLIC_SENTRY_DSN`: optional browser telemetry DSN; it is an ingestion identifier, not an administrative credential.

## Routing and feature flags

`YAHOO_FINANCE_ENABLED`, provider routing variables and `ENABLE_*` flags accept explicit documented values. Defaults keep optional paid/AI/realtime/backtest features disabled. `ENABLE_MOCK_FALLBACK` defaults to false so fictional data cannot silently enter production.

## Validation behavior

`src/schemas/env.ts` validates values centrally. The base app can build without optional external resources, but database/auth/Redis/provider services expose controlled `NOT_CONFIGURED` states when their feature dependencies are missing. Status functions return booleans only.
