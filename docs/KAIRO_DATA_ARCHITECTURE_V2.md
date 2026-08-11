# KAIRO Data Architecture V2

## Objective

KAIRO separates ingestion from presentation. UI requests read normalized PostgreSQL data or a versioned Last Known Good (LKG) snapshot. Provider responses are never the durable application state.

## Data path

`official/commercial source → ProviderGatewayV2 → redacted raw record → normalization → quality gate → versioned snapshot → LKG → service/API → UI`

- Raw payloads are content-hashed and idempotent. Credential query parameters and headers are redacted before persistence.
- Normalized observations carry observed, effective, published, available and fetched timestamps where the source provides them.
- A publish transaction stores the candidate, quality result and LKG promotion atomically.
- Missing values are `null` with an explicit status. They are never converted to zero.
- A suspicious empty or material coverage collapse is stored as a rejected candidate and cannot replace LKG.

## Layers

| Layer | Main tables |
| --- | --- |
| Operational | `provider_runs`, `provider_quota_states`, `provider_watermarks` |
| Raw | `raw_provider_records`, `raw_source_documents` |
| Normalized | `normalized_market_observations`, `normalized_economic_observations`, `economic_release_events`, `positioning_observations` |
| Published | `data_snapshots`, `last_known_good`, `data_quality_records`, `data_conflicts` |
| Scheduling | `ingestion_jobs`, `ingestion_runs` |

Schema versioning and model versioning are distinct. All migrations are additive; production migration is a separate operator action.
