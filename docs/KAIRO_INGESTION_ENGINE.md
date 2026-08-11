# KAIRO Ingestion Engine

Each job has a registry name, provider, dataset, schedule, priority and persisted run. `ProviderGatewayV2` supplies schema validation, timeout, bounded retry with jitter, single-flight, Redis fresh/stale cache, circuit breaker, redacted logging and optional LKG fallback.

Jobs are invoked through the authenticated cron route `/api/cron/data-v2?job=<name>` or the administrator control room. Supported names are `economic`, `calendar`, `political`, `cftc`, `news`, and `global-risk`. Distributed locks prevent concurrent runs. Manual runs are same-origin protected and rate-limited.

Schedules live in `DATA_V2_SCHEDULES` and can be overridden with `KAIRO_SCHEDULE_*`; Vercel invocation cadence remains deployment configuration. Watermarks record attempts, successful syncs and external timestamps. The job endpoint never returns secrets or authenticated upstream URLs.

Writes are idempotent via provider/source identifiers or payload hashes. A failed normalization never partially publishes a dataset snapshot.
