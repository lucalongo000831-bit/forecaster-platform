# Company scoring model

## Versions and weights

Initial version: `company-score-v1.0.0`. Weights are centralized in code and must not change without a version increment.

| Component | Weight |
| --- | ---: |
| Company quality | 20% |
| Growth | 12% |
| Profitability | 10% |
| Cash flow and earnings quality | 12% |
| Balance sheet | 8% |
| Moat | 10% |
| Management | 6% |
| Valuation | 12% |
| Risk | 5% |
| Momentum and sentiment | 5% |

Every component is 0–100. Risk is converted to a positive contribution as `100 - riskScore`. Unavailable components are not assigned a neutral 50; their weights are removed, remaining weights are renormalized and confidence is reduced by missing weight.

## Confidence

Confidence combines data completeness, source quality, history length, freshness, consistency, scenario dispersion and sample size. Labels are `VERY_LOW`, `LOW`, `MEDIUM`, `HIGH`, `VERY_HIGH`. Missing material statements prevents `HIGH` or `VERY_HIGH`.

## Verdict matrix

The matrix considers quality, valuation, risk, deterioration, momentum and margin of safety. High quality with elevated valuation maps to `WATCH` or `ACCUMULATE_ON_WEAKNESS`, not automatic `BUY`. Low quality and low valuation is flagged as value-trap risk. `SHORT` requires combined fundamental deterioration, negative momentum, aggressive embedded expectations and acceptable squeeze risk. Insufficient material data maps to `INSUFFICIENT_DATA`.

## Auditability

Each component records positive and negative reasons, used fields and missing fields. Score snapshots contain all version identifiers and input timestamps. Historical snapshots are immutable.
