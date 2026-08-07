# Vercel setup

## Import

1. Import the GitHub repository into Vercel.
2. Set **Root Directory** to the directory containing `package.json` (the repository root for the current project).
3. Select **Framework Preset: Next.js**.
4. Leave **Build Command** and **Install Command** on automatic detection, or use `npm run build` explicitly.
5. Leave **Output Directory empty**. Do not set `public`, `.next`, `dist`, `build` or `out`.

`vercel.json` intentionally contains no `outputDirectory`. The production build is the standard Next.js build.

## Environment variables

Configure server secrets separately for Production and Preview. Never add provider keys with a `NEXT_PUBLIC_` prefix.

Required for public market research:

- `YAHOO_FINANCE_ENABLED=true`
- `NEXT_PUBLIC_APP_URL=https://your-domain.example` (use the preview URL in a Preview environment when testing writes)

Required for persistent account features:

- `DATABASE_URL`: pooled PostgreSQL URL
- `DIRECT_DATABASE_URL`: direct migration URL
- `AUTH_SECRET`: random value of at least 32 characters
- `NEXTAUTH_URL`: canonical application origin

Recommended for multi-instance production:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Operational secrets:

- `CRON_SECRET`: Vercel sends it as `Authorization: Bearer …` to cron routes
- `INTERNAL_API_SECRET`: protects detailed provider and database health checks

Optional providers and their feature flags are listed in `.env.example` and `docs/ENVIRONMENT_VARIABLES.md`.

## Database

1. Provision PostgreSQL in the same or a nearby region.
2. Add pooled and direct URLs to a local untracked `.env.local`.
3. Run `npm run db:migrate` from a trusted workstation or deployment job.
4. Add the same encrypted variables to Vercel.
5. Verify `/api/health/database` with the internal bearer secret.

Migrations are never executed automatically during `next build`.

## Redis

Create an Upstash Redis database near the Vercel function region and set both REST variables. Without Redis, local development uses bounded in-memory cache and limits; multi-instance production should not rely on that fallback for distributed coordination.

## Cron strategies

### Hobby-compatible

`vercel.json` schedules `/api/cron/daily` once per day. The job warms selected global instruments, refreshes calendars/news/fundamentals, evaluates alerts and applies retention. Tasks are idempotent and protected by `CRON_SECRET`.

### Frequent production updates

With Vercel Pro or an external scheduler, call `/api/cron/alerts` at a plan-appropriate frequency (for example every 5–15 minutes) and keep `/api/cron/daily` daily. Send `Authorization: Bearer $CRON_SECRET`. Use Redis for distributed locks and monitor provider quotas before increasing frequency. Heavy ingestion should move to a dedicated worker/queue rather than extending request duration.

## Preview and production

- Configure separate database/Redis resources for Preview when private-flow testing is required.
- Use a preview-specific canonical URL so same-origin write checks succeed.
- Keep paid provider plans disabled in Preview unless intentionally budgeted.
- Deploy, then check `/api/health`; use the protected health routes for operator diagnostics.
- Redeploy after changing any environment variable.

## Domains and final verification

After connecting the production domain, update `NEXT_PUBLIC_APP_URL` and `NEXTAUTH_URL` to the exact HTTPS origin. Redeploy and verify login, logout, write operations, cookie security, cron logs, provider attribution and error states. Vercel project settings can retain a stale Output Directory override even when the repository is correct; confirm it is blank in **Build & Deployment**.
