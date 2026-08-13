# KAIRO Global Markets V2

Model version `global-stress-v2` retains the 0–100 score and GREEN/YELLOW/ORANGE/RED thresholds.

| Component | Weight | Principal inputs |
| --- | ---: | --- |
| Volatility | 13% | VIX, realized volatility |
| Credit | 13% | credit proxies; official spread registry ready |
| Liquidity | 12% | spread, relative volume and financial-condition proxies |
| Rates | 9% | rates and curve |
| Equity stress | 10% | drawdowns, trend, volatility |
| Market breadth | 9% | sector universe and relative breadth proxies |
| Cross asset | 9% | rolling correlations and transmission |
| Macro | 9% | growth, inflation, labor and calendar |
| Positioning | 6% | CFTC COT/TFF |
| Energy | 4% | EIA inventory/storage plus labelled price proxy |
| News/geopolitical | 6% | persisted Marketaux sentiment and deterministic risk topics |

Missing components never score zero. They use a valid stale component with penalty or are removed and remaining weights renormalized. With no usable layer the UI displays `DATA UNAVAILABLE`, not a GREEN claim.
