# Signal and market-regime engine

## Models

- Signal model: `multi-factor-signal-v1.0.0`.
- Regime model: `market-regime-v1.0.0`.
- Supported horizons: intraday, 1D, 1W, 1M, 3M, 6M, 12M and long term.

The signal is a weighted score from 0 to 100. Weights are centralized in
`src/engines/signals/config.ts` and change by horizon. Available weights are
renormalized, while unavailable inputs are never replaced with invented values.
The configured categories are: strong sell `[0,20)`, sell `[20,40)`, hold
`[40,60)`, buy `[60,80)` and strong buy `[80,100]`.

No category is emitted when overall completeness is below 45%, technical
completeness is below 50%, or fewer than 30 price observations are available.
The API explicitly returns `category: null` and `dataQuality: INSUFFICIENT`.

## Factors

Technical trend, momentum, volatility, volume, price structure and relative
strength come from the versioned technical engine. Fundamentals are included
only when its confidence is not `INSUFFICIENT`. Seasonality uses the current
calendar month's adjusted-close mean, hit rate and stability. Market regime is
derived independently from the benchmark's long trend, price structure,
momentum and realized volatility.

The regime taxonomy is bull, bear or range crossed with low or high volatility.
Risk appetite is labelled risk-on only for bull/low-volatility conditions and
risk-off for bear or high-volatility conditions.

## Validation boundary

`historicalHitRate` intentionally remains null until the backtest engine can run
walk-forward, point-in-time validation without leakage. `sampleSize` is the
number of price observations used, not a claim of predictive accuracy. Signals
are experimental analytics and are not investment recommendations.

## Serving and cache

`GET /api/analysis/signal?symbol=AAPL&horizon=1m` runs only in the Node.js server
runtime, is rate-limited, uses provider-level stale-while-revalidate caches and
returns a five-minute shared HTTP cache policy. No browser component imports a
financial provider or contacts an upstream provider directly.
