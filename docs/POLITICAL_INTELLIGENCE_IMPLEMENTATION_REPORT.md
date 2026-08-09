# Political Intelligence implementation report

## Delivered

- Typed political domain and central server-only router.
- FMP House/Senate normalization with transaction/disclosure date separation.
- PostgreSQL schema, indexes, migration, idempotent repository and sync health.
- Activity, direction, delay, cluster, timeline and post-disclosure performance engines.
- Global, instrument and politician views with filters, pagination, CSV and responsive charts.
- Internal APIs with validation, rate limiting, caching, Node runtime and readable failures.
- Company Intelligence context integration with no score contamination.
- Disclosure-date alerts and daily ingestion hook.
- Controlled five-year backfill and live FMP smoke-test commands.
- Unit tests for normalization, deduplication, clustering, ranges, delays, verification and look-ahead protection.

## Completeness contract

The UI reports transaction totals, canonical mapping rate, unresolved assets, logical duplicates, verification counts and data completeness. Empty provider results render as unavailable/empty data, never demo disclosures. Global history is bounded by what the configured FMP plan and requested backfill window return.

## Security and compliance

No new key is required. FMP remains server-only. OpenAI is not used. No accusation, legality inference, insider-trading claim, or political intent classification is generated. Public descriptions use neutral “disclosed activity” language.

## Acceptance commands

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:political
```

Manual acceptance covers the global route, AAPL/NVDA/MSFT company routes, member profiles, filters, transaction/disclosure markers, unresolved rows, CSV and mobile/tablet widths.
