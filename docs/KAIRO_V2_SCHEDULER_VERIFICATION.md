# Kairo Data V2 scheduler verification

Vercel invokes the category-specific `/api/cron/data-v2?job=<job>` routes on staggered daily schedules compatible with the current Hobby account (CFTC remains weekly). The route uses the Node.js runtime and requires the standard `Authorization: Bearer $CRON_SECRET` check. It launches idempotent, lock-protected Data V2 jobs for economic observations, calendar, political disclosures, EIA energy, CFTC positioning, news and global risk. `KAIRO_SCHEDULE_*` can describe a higher cadence after a Pro-plan upgrade, but the deployed `vercel.json` must be changed at the same time.

Each run is persisted in `calculation_runs`. Scheduler heartbeat derives expected cadence, last start, next expected time and `HEALTHY`, `LATE`, `MISSED`, `FAILED` or `DISABLED` status. `/preferences/data-quality-v2` displays this without secrets.

Run `scripts/verify-scheduler-v2.ts` after deployment. A second controlled run must not increase rows protected by unique fingerprints; `scripts/check-kairo-v2-idempotency.ts` checks the political path.
