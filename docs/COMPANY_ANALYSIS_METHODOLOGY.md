# Company analysis methodology

## Principles

Company Intelligence is downside-first, evidence-based and non-personalized. It analyzes the selected equity, not the user's capital, portfolio or risk tolerance. Conclusions distinguish `FACT`, `CALCULATED`, `ESTIMATE`, `MODEL_OUTPUT`, `ANALYST_CONSENSUS` and `SCENARIO`.

## Data validation

- Preserve `null`; never convert missing values to zero.
- Normalize percentages to decimal form and currency to the issuer's reporting currency.
- Check `assets ≈ liabilities + equity` with a tolerance based on reported scale.
- Check cash-flow and EPS/share consistency when all operands exist.
- Reject duplicate periods, invalid dates, non-finite values and impossible ratios.
- Flag stale inputs and material provider divergence; prefer the configured primary provider but reduce confidence.

## Historical measures

- `YoY = current / previous - 1` when the previous value is non-zero and signs permit interpretation.
- `CAGR(n) = (ending / beginning)^(1/n) - 1` only for positive comparable endpoints.
- Stability uses dispersion relative to the magnitude of the series.
- Acceleration compares recent growth with the prior multi-period average.
- Maximum drawdown is the minimum `price / runningPeak - 1` over validated adjusted closes.

## Earnings and cash flow

Cash conversion compares operating cash flow with net income. FCF equals reported FCF when available; otherwise it is operating cash flow plus provider-signed capital expenditure. Maintenance and growth capex are never separated unless a source explicitly provides that distinction.

Accrual, dilution and normalization risk are scored only from observed statement fields. Missing receivables, inventory, SBC, adjusted earnings or one-off details lower completeness instead of producing assumptions.

## Qualitative assessments

Moat and management scores require structured quantitative evidence. News may support or contradict an assessment but cannot independently establish a moat, fraud, market share or management quality. Unsupported categories remain `UNCERTAIN`.

## Horizons

Intraday through one year emphasizes technical state, volatility, known events and analyst/forecast dispersion. Three to twenty years emphasizes business quality, reinvestment, FCF and valuation. Uncertainty bands widen with horizon; 10/15/20-year results are CAGR/scenario ranges rather than promises.

## Language

Reports avoid certainty, urgency and FOMO. Each decision includes what is priced in, how the thesis can fail, an invalidation condition, limitations and why the market may be right.
