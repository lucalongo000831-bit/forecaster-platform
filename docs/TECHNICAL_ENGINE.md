# Technical engine

Model version: `technical-v1.0.0`.

`src/engines/technical` contains pure server-side calculations over validated, chronologically sorted OHLCV bars. Duplicate timestamps are removed, malformed bars are discarded, and fewer than 30 valid observations produce `INSUFFICIENT_TECHNICAL_DATA`. An unavailable lookback yields `null`; zero is never substituted for missing market data.

## Implemented measures

- Trend: SMA 10/20/50/100/200, EMA 9/12/21/26/50/200, five-observation slopes, percentage distances and recent golden/death cross detection.
- Momentum: Wilder RSI(14), MACD 12/26 with EMA(9) signal and histogram, ROC(20), stochastic %K(14)/%D(3), simple momentum(10).
- Volatility: true range, Wilder ATR(14), 20-observation realized/annualized log-return volatility, Bollinger bands/bandwidth, price z-score and maximum drawdown.
- Volume: average 20/50, relative volume, z-score, OBV and accumulation/distribution.
- Structure: trailing support/resistance, Donchian 20, breakout/breakdown, five-session swing points and distance from 52-week extremes.
- Relative strength: return spread versus a supplied benchmark over 21/63/126/252 observations.

Scores are bounded to 0–100 and are deterministic descriptive measures. The composite technical score is the arithmetic mean of available trend, momentum, volatility, volume, structure and relative-strength component scores. It is not an investment recommendation and is not promoted to a trading signal until the signal engine validates completeness.

The endpoint `GET /api/analysis/technical?symbol=&horizon=&benchmark=` returns the latest serializable snapshot, model version, observation count, data timestamp, completeness and provider provenance. Raw historical bars are deliberately excluded from the response payload.

## Bias controls

- Every rolling calculation uses only the current and preceding observations.
- Moving averages remain unavailable until the full lookback is present.
- Cross detection compares current values with values five observations earlier; it never uses a later bar.
- Relative strength compares trailing returns independently and never aligns to future timestamps.
- Unit tests verify prefix invariance for rolling SMA calculations and reject insufficient samples.
