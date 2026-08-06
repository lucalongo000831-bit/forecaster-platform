# Deployment plan

## Vercel application

- root directory is the folder containing `package.json`.
- framework preset is Next.js; build/install commands remain automatic or `npm run build`/`npm install`.
- Output Directory has no override. Never set `public`, `.next`, `dist` or `build`.
- provider routes use Node.js runtime; long-lived WebSockets require a separate gateway.

## Required services

1. PostgreSQL with pooled `DATABASE_URL` and migration-safe `DIRECT_DATABASE_URL`.
2. Upstash-compatible Redis for cache, locks and distributed rate limiting.
3. Vercel environment variables for Development, Preview and Production.
4. Optional external scheduler/worker for frequent updates; Hobby remains on-demand/daily.

## Release sequence

1. install with lockfile; run lint, typecheck, unit/integration tests and production build.
2. run secret scan and review migration SQL.
3. backup production database, apply forward migrations using the direct URL.
4. deploy Preview, execute smoke/E2E tests and provider health checks.
5. deploy Production, verify alias, public health and critical instrument pages.
6. monitor provider/cache/database error rates; rollback application if necessary. Database rollback uses explicit compensating migrations, never destructive reset.

## Cron strategies

- Hobby: daily idempotent refresh, on-demand SWR and no minute-level dependency.
- Pro/external scheduler: configurable quote/news/alert jobs protected by `CRON_SECRET`, distributed locks and bounded queues.
