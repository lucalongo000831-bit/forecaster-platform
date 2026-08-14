# Kairo Seasonality Engine V2

Model version: `seasonality-v2.0.0`.

## Purpose and non-goals

Seasonality V2 is a deterministic historical-analysis engine for equities, ETFs and cryptoassets. It describes recurring calendar patterns; it does not infer causality, guarantee future returns or constitute investment advice. Missing history produces an explicit unavailable or insufficient state and is never replaced with invented observations.

## Server data flow

```text
provider router (runtime fallback only when required)
  → validated daily-history snapshot
  → persistent DB / last-known-good
  → deterministic Seasonality V2 engine
  → persistent analysis snapshot + Redis/local TTL cache
  → Node.js API route
  → client visualization
```

The history key is the canonical symbol. Analysis snapshots are keyed by symbol, normalized-history hash and configuration hash. Daily history expires after 26 hours, analysis snapshots after 24 hours and the analysis cache after six hours. A stale persisted history remains a last-known-good fallback if all live providers fail. Client components never contact a provider directly.

## Input normalization

Input is real daily OHLCV from the existing financial-provider router.

For equities and ETFs, when `adjustedClose` is available:

```text
factor        = adjustedClose / close
adjustedOpen  = open × factor
adjustedHigh  = high × factor
adjustedLow   = low × factor
adjustedClose = adjustedClose
```

This prevents split and dividend artifacts when the provider supplies a total-return adjustment. If adjusted close is absent, the factor is `1`; that limitation remains visible through provider provenance. Crypto uses raw OHLC and factor `1`, preserves Saturday and Sunday observations, and uses UTC canonical dates. Equity/ETF timestamps use the canonical session date supplied by the market-data adapter.

Invalid dates, non-positive closes and non-finite values are rejected. Duplicate canonical dates resolve to the last provider observation, then bars are sorted ascending.

## Completed years and windows

The current UTC year is always separate. It never participates in historical curves, monthly summaries, directional aggregates or range-window statistics.

Supported historical windows are `1Y`, `3Y`, `5Y`, `7Y`, `10Y`, `15Y`, `20Y`, `25Y` and `MAX`. An N-year series is available only when N completed years exist. `MAX` requires at least two completed years. There is no relabeling of a shorter history as a longer window.

## Normalized curves

For every completed year, the first adjusted close is the base:

```text
curve_y(t) = (adjustedClose_y(t) / firstAdjustedClose_y − 1) × 100
```

Each completed-year curve is linearly interpolated onto a 1,000-point normalized progress grid `[0, 1]`. Equity/ETF progress is trading-session progress; crypto uses complete daily progress. Window curves contain pointwise mean and median series.

The current-year curve is based only on available sessions. It ends at `observed equity sessions / 252` for equities/ETFs or current UTC calendar-year progress for crypto. It is never extended to December.

## Correlation and best historical analogue

Pearson correlation compares the observed Current YTD values with the same prefix of each eligible curve:

```text
r = covariance(current, historical) / (σ_current × σ_historical)
correlationScore = max(0, r) × 100
```

At least 40 common normalized observations are required. A smaller sample is `INSUFFICIENT_SAMPLE`. Negative correlation remains available as `rawCorrelation` but maps to score `0`. The best correlated year is selected dynamically from completed years using only the common YTD prefix. After selection, its complete historical Jan–Dec curve may be shown strictly as a historical analogue, not a forecast.

## US presidential cycles

Completed years are classified by `year mod 4`:

- `0`: election year;
- `1`: post-election year;
- `2`: midterm year;
- `3`: pre-election year.

Each cycle exposes mean and median curves, sample years, sample quality and YTD correlation. The classification is technically available to crypto, but short crypto histories correctly receive low or insufficient quality.

## Calendar range trades

The selected range uses `MM-DD` boundaries and may cross December–January. For each eligible year:

- opening session: first observation on or after the start date;
- closing session: last observation on or before the end date;
- open price: adjusted open of the opening session;
- close price: adjusted close of the closing session.

Weekend and holiday boundaries therefore map to actual sessions for equities/ETFs; crypto normally uses the exact day.

```text
longReturn  = (close / open − 1) × 100
shortReturn = (open − close) / open × 100
maxRise     = (max(adjustedHigh) / open − 1) × 100
maxDrop     = (min(adjustedLow)  / open − 1) × 100
```

For LONG, favorable/adverse excursions use the maximum/minimum raw intrarange return. For SHORT, the intrarange returns are directionally inverted before taking maximum/minimum. Success probability is the share of direction-adjusted returns above zero. Each eligible window, presidential cycle and best historical year exposes probability, mean, median, best, worst, average max rise/drop, observations, years, completeness and quality.

## Monthly matrix

A month return consistently uses adjusted first-session open to adjusted final-session close:

```text
monthlyReturn = (lastAdjustedClose / firstAdjustedOpen − 1) × 100
```

Probability is `positive completed months / valid completed months × 100`. Average and median use completed historical years only. The current row is descriptive: past months are complete, the current month is `IN_PROGRESS`, future months are missing, and none enters the historical summary.

## Directional scores

Daily returns use adjusted close-to-previous-session close. Daily buckets group by calendar day inside the selected month. Weekly buckets mean weekday tendency (Mon–Fri for equities/ETFs; Mon–Sun for crypto). Monthly buckets use the monthly-return definition above.

For all three frequencies:

```text
p = positive observations / valid observations

score =  p × 100          when p > 0.5
score = -(1 − p) × 100    when p < 0.5
score = 0                 when p = 0.5
```

Thus `+70` means a 70% historical LONG tendency and `−70` means a 70% historical SHORT tendency. Current-year observations are excluded. Every bucket includes sample size, contributing years, quality and completeness.

## Quality

Quality is explicit and sample-based:

- `INSUFFICIENT`: fewer than two samples/years or a required threshold is not met;
- `LOW`: fewer than five;
- `MEDIUM`: fewer than ten;
- `HIGH`: ten or more.

Correlation has its own observation thresholds: insufficient below 40, low below 100, medium below 200 and high at 200 or more. Availability, quality and completeness are separate concepts.

## API

`GET /api/analysis/seasonality` runs in the Node.js runtime and accepts:

- `symbol` (required);
- `window` (single-window backward compatibility);
- `windows` (comma-separated V2 windows);
- `month` (`1..12`);
- `rangeStart`, `rangeEnd` (`MM-DD`);
- `side` (`LONG` or `SHORT`);
- `includeCycles`, `includeCorrelations`, `includeTradeStats`, `includeTable` (`true` or `false`).

Responses include `modelVersion`, `calculatedAt`, `dataTimestamp`, provider/source, `historyHash`, `configurationHash`, quality and available-history metadata. The route is rate-limited and returns cache directives of six hours plus 24-hour stale-while-revalidate.

## Deterministic regression coverage

The engine test suite covers window boundaries, current-year and partial-month exclusion, 1,000-point curves, no-look-ahead correlation, dynamic best year, presidential classification, monthly probability/mean/median, exact signed directional scoring, weekday series, weekend range mapping, cross-year ranges, LONG/SHORT inversion, high/low excursions, equity split adjustment, crypto weekends, insufficient history and serialization without `NaN`.
