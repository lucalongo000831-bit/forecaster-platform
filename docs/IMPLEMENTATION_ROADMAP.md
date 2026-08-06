# Implementation roadmap

Every milestone ends with lint, typecheck, unit/integration tests, build, documentation update and a separate commit.

| Milestone | Deliverable | Exit criteria |
| --- | --- | --- |
| 0 Audit | inventory, baseline build, architecture documents | 12 required documents committed; build green |
| 1 Foundations | environment schema, Drizzle/PostgreSQL, cache abstraction, request IDs, auth foundation, health | migrations generated; safe degraded mode without external services |
| 2 Providers | normalized contracts and Yahoo/FMP/Alpha/Massive adapters | contract fixtures pass; server-only boundary verified |
| 3 Market UI | provider router, search, quote, charts, profile/status | international ticker matrix passes |
| 4 Technical | indicators and technical API/UI | pure-engine tests cover insufficient input and NaN |
| 5 Fundamental | statements, metrics and scores | no missing-value-as-zero behavior |
| 6 Seasonality | 1/5/10/15/20/MAX windows | sample quality and robustness visible |
| 7 Signals | multi-horizon versioned signal model | weights sum to one and confidence gating passes |
| 8 Targets/risk | analyst/technical/fundamental/composite, DCF, stops/targets | instrument applicability enforced |
| 9 Forecast | bootstrap and Monte Carlo percentiles | deterministic seed tests and calibration metadata |
| 10 News | ingestion, dedupe, sentiment/geopolitical analysis | sources retained; prompt/data isolation documented |
| 11 Calendar | corporate/macro events and saved snapshots | future event vs model output visibly distinct |
| 12 Backtest | bias-aware engine, persistence and UI | next-bar execution and cost model tested |
| 13 Account | auth, watchlists, portfolios, transactions, alerts | ownership tests and durable CRUD pass |
| 14 Hardening | security, observability, accessibility, performance, jobs, Vercel, E2E | secret scan and critical E2E pass |

## External-resource gates

PostgreSQL (`DATABASE_URL`, `DIRECT_DATABASE_URL`), Redis and `AUTH_SECRET` require user-owned resources. Implementation and migrations can proceed without applying destructive operations. AI news classification remains disabled unless an OpenAI key and budget are explicitly authorized.
