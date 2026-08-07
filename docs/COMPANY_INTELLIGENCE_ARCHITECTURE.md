# Company Intelligence architecture

## Boundary

`CompanyIntelligenceService` is the only application entry point. It accepts a normalized equity symbol and orchestrates existing provider/analysis services plus dedicated company engines. UI components receive one serializable report contract and never import provider clients.

```text
Instrument page / Company API
        │
        ▼
CompanyIntelligenceService
        │
        ├── FinancialProviderRouter (quote, chart, profile, statements, ratios, news)
        ├── Existing technical/fundamental/seasonality/target engines
        ├── Company data validator
        ├── EarningsQualityEngine / CompanyQualityEngine
        ├── Moat / Management / Peer engines
        ├── Valuation / ReverseDCF / ScenarioDCF engines
        └── Risk / Horizon / Verdict / Report engines
        │
        ▼
Versioned result + optional append-only PostgreSQL snapshot
```

## Pipeline

Stages run through a typed result wrapper with `complete`, `partial`, `unavailable`, `not-applicable`, or `failed` status. Independent upstream calls run concurrently. A failed optional stage lowers confidence and records a limitation without discarding successful results.

1. Resolve instrument and establish applicability.
2. Load quote, profile, market status, long chart, fundamentals and optional statements/ratios/analyst/news/calendar.
3. Validate dates, units, statement identities, nulls and cross-provider divergence.
4. Calculate historical metrics, earnings quality and FCF quality.
5. Score company quality, moat and management with evidence thresholds.
6. Build peers only from verified search/provider data.
7. Calculate multiples, reverse DCF and bear/base/bull DCF.
8. Derive margin of safety and operational price ranges.
9. Reuse technical, seasonality, forecast and target outputs.
10. Build horizons, daily outlook, risk register, red flags and catalysts.
11. Generate deterministic verdict and source-linked report.
12. Persist a new immutable snapshot when database configuration is available.

## Caching and limits

| Resource | Fresh | Stale window |
| --- | ---: | ---: |
| Quote | 20 s | 2 min |
| Intraday/daily outlook | 1–5 min | 15 min |
| News | 10 min | 1 h |
| Technical/seasonality | 15 min–1 h | 6–24 h |
| Statements/ratios/analyst | 6–24 h | 2–7 d |
| Peer/valuation/company report | 6 h | 24 h |

Public reads are per-IP limited. Refresh, custom DCF, export and backtest use tighter limits and require authentication where they consume durable resources. Redis provides shared cache/locks in production; bounded memory is development fallback only.

## Versioning

Every output carries `modelVersion`, `scoringVersion`, `valuationVersion`, `signalVersion`, `reportVersion`, provider metadata, `dataTimestamp` and `calculatedAt`. Formula or weight changes increment the relevant version. Existing database snapshots are never rewritten.

## Security

- Provider credentials have no `NEXT_PUBLIC_` prefix.
- Company modules containing provider/DB logic import `server-only`.
- Route inputs are validated by Zod after URL decoding and normalization.
- Errors use public codes and correlation IDs, never upstream URLs, headers or stack traces.
- News and filings are untrusted evidence; URLs must be HTTPS and text never controls formulas or executable paths.
