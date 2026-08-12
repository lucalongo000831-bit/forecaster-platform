# Kairo Data V2 scheduler verification

Vercel invokes `/api/cron/data-v2` every six hours. The route uses the Node.js runtime and requires the standard `Authorization: Bearer $CRON_SECRET` check. It launches idempotent, lock-protected Data V2 jobs for economic observations, calendar, political disclosures, EIA energy, CFTC positioning, news and global risk.

Each run is persisted in `calculation_runs`. Scheduler heartbeat derives expected cadence, last start, next expected time and `HEALTHY`, `LATE`, `MISSED`, `FAILED` or `DISABLED` status. `/preferences/data-quality-v2` displays this without secrets.

Run `scripts/verify-scheduler-v2.ts` after deployment. A second controlled run must not increase rows protected by unique fingerprints; `scripts/check-kairo-v2-idempotency.ts` checks the political path.
