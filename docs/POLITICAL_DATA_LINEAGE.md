# Political data lineage

| Field group | Source | Transformation | Quality state |
|---|---|---|---|
| Filing/member/asset/transaction | FMP House/Senate endpoints | strict field aliases and enum normalization | `PROVIDER_ONLY` by default |
| Public availability | FMP disclosure/filing date | date-only UTC; required; missing rows excluded | point-in-time critical |
| Amount | FMP raw statutory range | min/max parser; midpoint labelled estimate | exact/range/unknown |
| Canonical instrument | Kairo instrument resolver | provider-symbol resolution; no fuzzy coercion | resolved/unresolved/non-market |
| Sector | resolved instrument profile | copied only when known | nullable |
| Duplicate identity | normalized logical fields | stable fingerprint; amendment preference | deterministic v1 |
| Price/performance | configured market price providers | first close on/after disclosure date | model output v1 |
| Cluster/activity | normalized disclosures | deterministic engines | model output v1 |
| Official verification | optional official record | field-by-field comparison | explicit status/conflicts |

Secrets remain server-side. API payloads expose normalized provenance, fetched timestamps, verification status and limitations, never provider headers or keys. `/api/political-intelligence/health` reports persistence/sync health without secret values.
