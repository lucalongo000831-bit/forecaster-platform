# Kairo Pattern Engine V2

## Scope and model contract

`pattern-v2.0.0` is Kairo's deterministic historical analogue engine for equities, ETFs and cryptoassets. It is descriptive research, not a forecast or a trading recommendation. It never substitutes unavailable history with mock observations and never publishes a fabricated 50/50 probability.

The engine is implemented as a pure TypeScript calculation in `src/engines/pattern`. Provider selection, persistence and fallback live in `src/services/analysis/pattern-service.ts`; the public server-only boundary is `GET /api/analysis/pattern`.

## Previous flow and V2 replacement

The previous Pattern page called `FinancialDataProvider.getPatterns`. `YahooFinanceProvider.getPatterns` downloaded five years, split the history into unrelated fixed 21-session blocks, classified each block only by its own return and treated the most recent block as “most correlated”. When no cases existed it returned 50/50. There was no reference date, similarity calculation, overlap control, deterministic cache identity or no-lookahead contract.

V2 keeps the existing page and provider abstraction but replaces the calculation flow:

```text
persisted MAX daily history / LKG
  -> provider router only when persisted history is unavailable
  -> canonical adjustment and reference-date resolution
  -> Pattern Engine V2 analogue search
  -> Redis + durable analysis snapshot
  -> API and legacy Pattern page adapter
```

The existing `PatternChart`, `PatternCasesTable`, `FinancialDataProvider`, central provider router and data-v2 snapshot infrastructure remain in use. The page integration is intentionally minimal; the complete interactive Pattern V2 experience is a separate UI task.

## Reference date and strict no-lookahead

`referenceDate` is optional. Missing input means the latest available observation. A requested equity/ETF weekend or holiday resolves to the latest observation **on or before** the request. Crypto uses the requested calendar date when a canonical observation exists.

Only observations with `timestamp <= resolvedDate` enter:

- the observed reference path;
- candidate selection and ranking;
- the history hash used by the analysis cache;
- probability, robustness and strength.

A historical candidate is valid only when its complete outcome horizon ends on or before the resolved reference date. Prices after a candidate match window are used only for that historical candidate's realized outcome; they are never similarity inputs. Mutating every value after a historical reference date therefore leaves its observed path, history hash, ranking and probabilities unchanged.

The response exposes requested, resolved, previous valid, next valid and latest available dates so a client can implement previous/next/latest stepping without changing the engine.

## Horizons

The initial version uses observation counts rather than elapsed wall-clock months:

| Lookback | Observed path | Outcome horizon |
| --- | ---: | ---: |
| 1M | 21 observations | 21 observations |
| 3M | 63 observations | 63 observations |
| 6M | 126 observations | 126 observations |

For equity and ETF daily history these are trading sessions. For crypto they are consecutive available 24/7 daily observations, including Saturday and Sunday. Outcome horizon equals lookback horizon in V2.

## Price normalization and corporate actions

Equity and ETF calculations prefer `adjustedClose`. When both raw close and adjusted close are present, the daily adjustment factor is:

```text
factor[t] = adjustedClose[t] / close[t]
```

The engine applies the same factor to daily high and low before max-rise/max-drop calculations. This keeps split and dividend economics consistent. Crypto uses canonical raw OHLC and never applies the equity calendar or adjustment factor.

Each lookback is represented as a normalized log-price path:

```text
path[t] = ln(adjustedPrice[t]) - ln(adjustedPrice[start])
```

This removes price-level differences while preserving cumulative-return shape.

## Composite Pattern Similarity

Every component is scaled to 0–100. The versioned composite is:

```text
similarity =
  0.35 * correlationScore
  + 0.25 * shapeDistanceScore
  + 0.15 * directionalAgreement
  + 0.15 * volatilitySimilarity
  + 0.10 * trendSimilarity
```

- `correlationScore = (Pearson(pathRef, pathCandidate) + 1) / 2 * 100`.
- `shapeDistanceScore = exp(-RMSE / shapeScale) * 100`, where `shapeScale` is the combined path dispersion with a 2% floor.
- `directionalAgreement` is the percentage of one-observation log returns with the same sign.
- `volatilitySimilarity = exp(-abs(ln(volCandidate / volReference))) * 100`.
- `trendSimilarity` compares least-squares path slopes, scaled by both slopes and observed volatility.

Default minimum composite similarity is 55. The service returns at most 20 matches and requires at least 5 valid matches before publishing a probability.

## Temporal de-correlation

Candidates are initially ranked by composite similarity. A greedy filter keeps a candidate only when its match-end observation is sufficiently separated from every already selected candidate. With the default maximum overlap of 25%, minimum separation is:

```text
ceil(lookbackObservations * 0.75)
```

This prevents nearly identical rolling windows from filling the top results.

## Outcome metrics and stable event identity

Each selected event has a stable ID derived from symbol, lookback, start, match end and outcome end. It includes its rank, component scores and normalized underlying future path.

For entry close `P0` and the completed future horizon:

```text
performance = futureClose[last] / P0 - 1
maxDrop     = min(futureAdjustedLow / P0 - 1)
maxRise     = max(futureAdjustedHigh / P0 - 1)
```

The neutral band is volatility-aware and common to the matched set:

```text
neutralThreshold = max(0.5%, referenceDailyVolatility * sqrt(outcomeObservations) * 0.10)
```

- performance above the threshold is `BULLISH`;
- performance below the negative threshold is `BEARISH`;
- otherwise it is `NEUTRAL`.

## Probabilities and paths

Bullish, bearish and neutral probabilities use **all valid matched events** as the denominator. Neutral observations therefore remain explicit; they are not silently removed or allocated to either side. If the valid sample is below the configured minimum, the response status is `INSUFFICIENT_SAMPLE`, published probabilities are unavailable, robustness stars are unavailable and strength is `INSUFFICIENT_DATA`.

`mostCorrelated` is rank 1 by composite similarity. `averageLong` is the pointwise mean, median and interquartile band of the normalized underlying paths after bullish historical cases. `averageShort` applies the same calculation to bearish cases. It is explicitly an **underlying price path after bearish cases**, not fabricated short P&L. The API always returns individual matched paths, allowing a later UI to implement Single Events without another provider download.

## Kairo robustness 1–5

The proprietary robustness score is 0–100:

```text
robustness =
  0.20 * sampleAdequacy
  + 0.20 * medianSimilarity
  + 0.20 * outcomeConsistency
  + 0.15 * dispersion
  + 0.15 * temporalDiversity
  + 0.10 * subsampleStability
```

- `sampleAdequacy` measures valid matches against the configured minimum and target sample.
- `medianSimilarity` is the median composite similarity.
- `outcomeConsistency` is the largest bullish/bearish/neutral share.
- `dispersion` exponentially penalizes realized-performance standard deviation relative to median outcome and the neutral threshold.
- `temporalDiversity` measures distinct candidate years, capped at ten.
- `subsampleStability` compares bullish-minus-bearish balance in early and late chronological halves.

Stars map deterministically: 0–19 → 1, 20–39 → 2, 40–59 → 3, 60–79 → 4, 80–100 → 5. Insufficient samples expose no stars.

## Strength and direction

Direction is the largest of bullish and bearish probability only when it also exceeds neutral probability; otherwise it is `UNCERTAIN`.

- `STRONG`: dominant bullish/bearish probability ≥ 70% and robustness is 5/5.
- `MODERATE`: dominant probability ≥ 60% but Strong is not satisfied.
- `WEAK`: dominant probability < 60% with a sufficient sample.
- `INSUFFICIENT_DATA`: history or sample gate failed. This is never relabeled Weak.

## Persistence, LKG and cache identity

Pattern reuses the persisted `seasonality_daily_history_v2` MAX daily dataset because it is the same canonical adjusted market history. The service reads a current database snapshot first, requests the provider router only when necessary, persists successful history and falls back to the last-known-good snapshot when providers fail.

Analysis snapshots use dataset `pattern_analysis_v2`. The canonical cache identity includes:

- normalized symbol;
- resolved reference date;
- lookback;
- `pattern-v2.0.0`;
- history hash containing only observations on or before the reference;
- versioned search configuration.

Historical reference-date analyses are consequently deterministic and cannot absorb stale future observations.

## API

```http
GET /api/analysis/pattern?symbol=NVDA&referenceDate=2019-05-28&lookback=3M
```

`symbol` uses the platform's strict ticker validation. `referenceDate` is optional ISO `YYYY-MM-DD`; `lookback` is `1M`, `3M` or `6M`. The route runs in the Node.js runtime, is rate-limited by IP and never exposes provider credentials or upstream endpoint details.

The response contains reference metadata, observed path, matched events, most correlated event, average bullish/bearish underlying paths, probabilities, robustness, strength, quality, coverage and provenance metadata.

## Verification

Reference tests independently verify formulas on synthetic data rather than accepting the engine's own output as an oracle. Coverage includes:

- perfect analogue rank 1;
- mutation of all data after T without ranking changes;
- independent 7 bullish / 3 bearish = 70/30;
- independent OHLC max-drop/max-rise;
- high versus low robustness fixtures;
- temporal overlap limits;
- NVDA-style split adjustment;
- SPY/QQQ adjusted dividend behavior;
- BTC/ETH weekend observations;
- controlled outputs for NVDA, AAPL, MSFT, STLAM.MI, SPY, QQQ, BTC-USD and ETH-USD.
