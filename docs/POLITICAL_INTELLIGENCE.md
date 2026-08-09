# Political Intelligence

Political Intelligence turns US congressional financial disclosures into an auditable research view. It is not a politician “portfolio,” an allegation of misconduct, or a copy-trading signal.

## Surfaces

- `/political-intelligence`: global House/Senate activity, leaderboards, clusters, sectors, delay statistics, timeline and post-disclosure studies.
- `/instrument/[market]/[symbol]/political`: disclosure activity mapped to one canonical instrument, with price chart and separate transaction (`T`) and public-disclosure (`D`) markers.
- `/politicians/[id]`: the member’s disclosed activity, clearly labelled as incomplete disclosure history rather than holdings.
- Company Intelligence includes a compact contextual section. Political activity never changes its fundamental score, valuation, verdict, or fair value.

## Data flow

FMP server adapter → normalized disclosure → canonical instrument resolution → logical deduplication → optional PostgreSQL persistence → deterministic engines → server-rendered page or same-origin API. Browser code never calls FMP and never receives provider credentials.

## Operations

Apply migrations before enabling persistence:

```bash
npm run db:migrate
npm run test:political
npm run political:backfill -- --from=2024-01-01 --to=2025-01-01 --chamber=ALL --max-pages=20
```

Backfills are capped at five years per invocation and require both `FMP_API_KEY` and a database URL. Output contains counts only. Daily maintenance performs an incremental latest-disclosure sync. Runtime reads remain available without PostgreSQL, but the health endpoint reports `RUNTIME_ONLY`.

## Model boundaries

- Amount ranges remain ranges. The midpoint is an explicitly labelled estimate used only for aggregation.
- Purchases and sales remain separate. Direction and activity intensity are separate metrics.
- Cluster detection requires at least two unique politicians; repeated filings by one person are not a cluster.
- Spouse-owned records remain visible and receive a documented 0.8 value weight only in cluster-strength estimation.
- Historical performance starts on the first market observation on or after `disclosureDate`.
- Official-source verification is a separate status and never silently overwrites a provider conflict.
