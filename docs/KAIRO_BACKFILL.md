# KAIRO Backfill

Run against a local or Preview deployment:

```bash
KAIRO_BACKFILL_BASE_URL=https://preview.example npm run data-v2:backfill -- economic
```

`CRON_SECRET` must exist in the process environment and is sent only as an authorization header. Available jobs: `economic`, `calendar`, `political`, `cftc`, `news`, `global-risk`.

Recommended order: database migration, economic, calendar, cftc, news, political, global-risk. Inspect `/preferences/data-ingestion` after each step. Re-running is safe: normalized data uses source/time keys and raw payloads use hashes. Stop if coverage collapses or candidates are rejected; never delete LKG to force a publish.
