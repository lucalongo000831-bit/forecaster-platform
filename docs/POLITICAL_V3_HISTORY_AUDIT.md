# Political V3 History Audit

Audit date: 2026-08-12

## Live source verification

- Bargo `/health` and `/trades` returned HTTP 200 with the documented schema and zero-based pagination.
- A dated Bargo keyless request for August 2025 returned no rows; Bargo documentation limits the free feed to approximately three months. Therefore Bargo alone cannot satisfy the 365-day merge gate.
- CapitolExposed `/api/v1/trades` returned HTTP 200, 32,922 indexed records, page metadata, and records spanning 2026 back through at least 2010 in sampled pages. It is used as the explicitly allowed free secondary fallback.
- FMP remains recent/incremental where the configured plan permits.
- House and Senate verification remain independent of operational history; absence of automated Senate verification does not convert a secondary record into an official record.

## Quality gates

The backfill command persists monthly coverage rows. A month is `AVAILABLE` when records were observed, `PARTIAL` when the operational source window was successfully checked but no row was present, and `NOT_CHECKED` when it was not queried. One old record is insufficient to claim a complete year.

Cross-source fingerprint fields are normalized politician, chamber, ticker/asset identity, transaction date, transaction type, amount bounds, and owner. Provider IDs and disclosure URLs are provenance, not logical identity. Delisted symbols such as `BERY` retain their historical identity and are not aliased to a successor.

## Backfill command

```bash
npm run political:v3:backfill -- --from=2025-08-12 --to=2026-08-12 --source=capitol-exposed --resume --batch-days=30
```

Use `--dry-run` for schema/coverage validation without database writes. The final production/Preview record counts, month coverage, mapping percentage, conflicts, and verification totals must be captured after the server-side migration and backfill. Code support alone is not a successful 1Y data audit.
