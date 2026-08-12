# Global direct coverage audit

## Semantics

- `DIRECT`: a provider or official persisted observation.
- `CALCULATED_FROM_DIRECT`: a deterministic transformation of direct observations, including returns, realized volatility, correlations and changes.
- `PROXY`: an explicitly labelled substitute such as an ETF price series.
- `LAST_KNOWN_GOOD`: a persisted prior component used after a current-source failure.
- `MISSING`: no defensible observation.

Credit includes the direct FRED `BAMLH0A0HYM2` high-yield option-adjusted spread. Energy consumes persisted EIA crude and natural-gas observations. Breadth requires at least 80% of the declared universe before publishing the sector-above-average metrics; the sector ETF set remains a proxy universe and is labelled as such. Liquidity contains direct quoted bid/ask where present and separate proxy measures.

Run `scripts/audit-global-direct-coverage.ts` to report direct-plus-calculated coverage, effective coverage, proxy share and missing inputs.
