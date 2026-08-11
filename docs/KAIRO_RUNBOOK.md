# KAIRO Data Runbook

| Symptom | Checks | Safe response |
| --- | --- | --- |
| Rate limited | provider circuit/quota state and last 429 | let stale cache/LKG serve; reduce background cadence |
| Auth failure | configured flag only; never print value | rotate in Vercel, redeploy, rerun one bounded job |
| Job stuck | ingestion run, distributed lock, provider latency | wait for timeout; do not create overlapping backfills |
| Coverage collapsed | quality anomalies and candidate/LKG counts | keep LKG; inspect schema/source change |
| Calendar empty | category status/count and release watermark | distinguish verified zero from source unavailable |
| Political empty | sync state, suspicious-empty log | preserve previous transactions; inspect provider scope |
| Global Risk stale | component freshness and active/stale layers | refresh source jobs before global-risk job |
| Database unavailable | `/api/health`, Vercel env presence | restore connection; application must degrade, not fabricate |

Control room: `/preferences/data-ingestion`. Diagnostics: `npm run data-v2:diagnose`. Health is degraded when critical datasets are missing, but degraded does not imply the entire web application is down.
