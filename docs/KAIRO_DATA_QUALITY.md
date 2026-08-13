# KAIRO Data Quality

## Status semantics

`AVAILABLE`, `STALE`, `PARTIAL`, `RATE_LIMITED`, `SOURCE_UNAVAILABLE`, `SOURCE_ERROR`, `INSUFFICIENT_DATA`, `INSUFFICIENT_HISTORY`, `NOT_APPLICABLE`, `UNSUPPORTED`, `UNVERIFIED`, `CONFLICT`, `LOADING`.

## Publish gates

- Source call and schema validation must succeed.
- An empty response is rejected if a previous non-empty LKG exists, unless the source explicitly verifies a true zero.
- A configurable coverage-drop threshold rejects sudden collapses.
- Missing values remain `null`; verified zero requires an observed numeric zero from an authoritative dataset.
- Rejected candidates are retained for diagnosis but are not published.

Coverage is calculated only over applicable fields. Global Risk reports weighted completeness, direct-data coverage, proxy share, active layers and stale layers. Missing components are excluded and weights renormalized; valid LKG components may be used with a freshness and confidence penalty.
