# Probabilistic forecast engine

`probabilistic-forecast-v1.0.0` returns a distribution rather than one certain
future price. Supported horizons are 1, 5, 10 and 20 trading days plus 1, 3, 6
and 12 months.

Each run combines equal rotating batches of:

1. bootstrap from recent historical log returns;
2. five-day block bootstrap, preserving short autocorrelation clusters;
3. Gaussian Monte Carlo calibrated to 65% recent and 35% longer volatility.

Drift is shrunk to 25% of its recent estimate and bounded to ±0.10% daily.
Trend, seasonality and regime adjustments are each separately capped so no
single factor dominates. High-volatility regimes increase simulated volatility
by 15%. Runs use a deterministic seed based on symbol, horizon, data timestamp
and simulation count, making cached results reproducible.

Outputs include P5/P10/P25/P50/P75/P90/P95, expected return, P10–P90 range,
probabilities relative to current price, target and stop, input sample size and
confidence. Walk-forward validation uses only the 126 observations preceding
each historical origin, then compares a shrunk-drift prediction with the
subsequent realized price. `modelError` is mean absolute percentage error; the
number and coverage of validation windows are shown explicitly.

Limitations: return distributions can change abruptly, Gaussian tails can
underestimate extreme events, provider histories may contain corrections, and
the model does not include options-implied distributions. Results are
experimental analytics, not investment recommendations.
