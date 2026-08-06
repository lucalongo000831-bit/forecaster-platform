# Seasonality engine

Model version: `seasonality-v1.0.0`.

The engine consumes validated adjusted-close history and supports `1Y`, `5Y`, `10Y`, `15Y`, `20Y` and `MAX`. It aggregates observations by month, weekday, week of year, day of month and decile of trading-year progress. Monthly returns use the first and last adjusted close inside each calendar month; daily calendar buckets use close-to-close adjusted returns.

Every bucket contains mean, median, positive hit rate, sample standard deviation, percentiles 10/25/50/75/90, best/worst observation, sample size, 95% normal-approximation confidence interval, an approximate two-sided p-value when at least five observations exist, and a first-half/second-half stability score.

Quality is explicit:

- `INSUFFICIENT`: one-year/descriptive windows, fewer than three observations or less than two years;
- `LOW`: fewer than five observations or five years;
- `MEDIUM`: fewer than twelve observations or ten years;
- `HIGH`: at least twelve observations and ten years.

The one-year window is always descriptive. P-values are omitted for inadequate samples. Missing/non-finite prices are filtered; split/dividend effects are controlled by adjusted close where the provider supplies it. The engine does not infer earnings/dividend event seasonality without point-in-time event records.

`GET /api/analysis/seasonality?symbol=&window=` returns only aggregated statistics, provenance, timestamp and model version—not the full historical dataset. The existing range selector refetches this internal server route and CSV export contains the displayed aggregate series.
