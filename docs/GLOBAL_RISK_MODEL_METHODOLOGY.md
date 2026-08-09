# Global Risk model methodology

Model version: `global-stress-v1`.

Weights are defined centrally in `src/engines/global-risk/config.ts`: volatility 15%, credit 15%, liquidity 15%, rates 10%, breadth 10%, equity 10%, cross-asset 10%, macro 8%, news/geopolitics 7%. Available component scores are weighted and normalized by available weight. Historical snapshots retain their original model version and payload.

Status thresholds are configurable: Green 0–24, Yellow 25–49, Orange 50–74 and Red 75–100. Trend compares the current result with available 1-day, 5-day and 20-day historical references. Small changes remain Stable; a weighted deterioration of at least four points is Deteriorating and at least 12 points is Rapidly Deteriorating. A five-point improvement is Improving.

Systemic stress is separate from the overall status. `ACTIVE` requires at least four independent critical components (score ≥70) and at least one transmission channel in credit or liquidity. `ELEVATED` requires three critical blocks plus that transmission condition. Two elevated blocks produce `WATCH`. An equity decline and volatility spike alone therefore cannot produce `ACTIVE`.

Confidence starts from weighted data completeness and is reduced for missing or stale provider layers. Component engines use transparent linear normalization with clamping to 0–100. Realized volatility is the annualized sample standard deviation of daily log returns; ATR is a 20-session true-range average divided by price; RSI uses 14 observed price changes; correlations use aligned 60-session log returns. Risk drivers are sorted weighted contributions. Stabilizers and trigger descriptions come from deterministic templates.
