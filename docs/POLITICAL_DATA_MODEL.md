# Political data model

## Identity and event separation

`politicians` stores normalized identity, chamber, party, state and provider identifiers. `political_filings` stores the public filing event. `political_transactions` stores each reported transaction and references both the politician and filing. This separation preserves amendments and multiple transactions in one filing.

The transaction model retains:

- raw asset description and ticker;
- canonical instrument and issuer links when resolvable;
- transaction date, disclosure date and `marketAvailableDate`;
- chamber, party, district and owner type;
- raw amount range, minimum, maximum and explicitly estimated midpoint;
- source URL, provider, fetch time and verification status;
- a stable logical fingerprint for idempotency.

## Derived tables

- `political_activity_snapshots`: versioned period summaries.
- `political_trade_performances`: disclosure-date performance and benchmark comparison.
- `political_clusters`: unique-politician clusters by symbol and side.
- `political_data_verifications`: provider/official comparisons and conflicts.
- `political_leaderboard_snapshots`: reproducible global rankings.
- `political_asset_aliases`: reviewed mappings for otherwise unresolved assets.
- `political_sync_states`: ingestion health and completeness counts.

Unknown fields remain nullable or use explicit `UNKNOWN` enum values. An unresolved asset is never coerced into a ticker. The migration is `drizzle/0007_last_songbird.sql`.
