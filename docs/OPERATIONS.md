# Operations and observability

## Signals

- Every API response includes `X-Request-Id`; failures return the same identifier in their JSON envelope.
- JSON logs contain allowlisted fields only: request/job/provider/operation, normalized symbol, status, duration, cache state, model version and error code.
- Provider requests log latency and error class. Cache access logs fresh, stale and miss outcomes. Calculation and job duration is versioned/persisted where PostgreSQL is configured.
- `/api/health` is public liveness only. `/api/health/providers` and `/api/health/database` require `Authorization: Bearer $INTERNAL_API_SECRET` and never return keys or connection strings.

## Scheduled work

`/api/cron/daily` and `/api/cron/alerts` require the cron bearer secret. The job runner coalesces local work, obtains a Redis distributed lock when available, enforces a deadline, logs duration and stores a `calculation_runs` record. Provider/calendar writes are upserts and alert events use deduplication keys.

## Retention

The daily maintenance job removes expired sessions, calculation/provider logs older than 30 days and internal alert events older than 180 days. Redis provider/cache keys expire by TTL. Adapt these windows after a documented legal and operational review.

## Incident checklist

1. Check public liveness.
2. Check protected database/provider status.
3. Correlate Vercel logs by request ID; never request user credentials.
4. Inspect quota and cache status before changing provider order.
5. Disable a plan-gated feature flag rather than retrying a forbidden endpoint.
6. Rotate an exposed secret in the provider/Vercel console, invalidate sessions if `AUTH_SECRET` was affected, and redeploy.
