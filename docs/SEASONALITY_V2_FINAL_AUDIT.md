# Seasonality V2 final quantitative audit

Audit date: 2026-08-14
Base: `feat/seasonality-v2-ui` at `889ed78`
Audit branch: `fix/seasonality-v2-final-audit`
Model: `seasonality-v2.0.0`

## Independent-reference policy

Golden tests calculate their expected values from raw deterministic OHLC fixtures without calling Seasonality engine helpers. The production engine is invoked only after the reference result exists. Exact arithmetic comparisons use an absolute tolerance of `1e-8`; comparisons involving a 1,000-point interpolated curve use `5e-4` percentage/correlation units to account for the engine's four-decimal curve serialization.

Reference formulas:

- Monthly return: `(last adjusted close / first adjusted open - 1) × 100`.
- Probability: `positive completed observations / valid completed observations × 100`.
- Average return: arithmetic mean of valid completed returns.
- LONG range return: `(adjusted exit close / adjusted entry open - 1) × 100`.
- SHORT range return: LONG return multiplied by `-1`.
- Max rise/drop: maximum/minimum of every adjusted intraperiod high/low relative to the adjusted entry open.
- Directional score: positive hit rate when above 50%; negative failure rate when below 50%; zero at exactly 50%.
- Correlation: Pearson correlation over the observed current-YTD point count only.

The audit discovered and fixed two quantitative edge cases:

1. The first trading session of a new year was previously compared with the final session of the prior year unless it happened to fall on January 1. The engine now excludes every cross-year close-to-close return.
2. A current month containing exactly one valid session was previously marked `MISSING`. It is now displayed as `IN_PROGRESS` with a null return and remains excluded from aggregates.

## Live golden-symbol history

The reproducible command is `npm run test:seasonality-audit`. It performs one canonical MAX-history request per symbol, calculates the analysis once, and emits metadata only. It never prints headers, credentials or provider payloads.

| Symbol | Class | First date | Last date | Completed years | Observations | Provider | Adjustment status | Provider ms | Calculation ms | Quality |
| --- | --- | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: | --- |
| NVDA | Equity | 1999-01-22 | 2026-08-14 | 27 | 6,933 | Yahoo | Adjusted OHLC observed | 6,273.3 | 251.2 | HIGH |
| AAPL | Equity | 1980-12-12 | 2026-08-14 | 45 | 11,510 | Yahoo | Adjusted OHLC observed | 1,450.6 | 337.5 | HIGH |
| MSFT | Equity | 1986-03-13 | 2026-08-14 | 39 | 10,184 | Yahoo | Adjusted OHLC observed | 12,805.5 | 321.0 | HIGH |
| STLAM.MI | Equity | 2000-01-03 | 2026-08-14 | 26 | 6,799 | Yahoo | Adjusted OHLC observed | 551.1 | 201.0 | HIGH |
| SPY | ETF | 1993-01-29 | 2026-08-14 | 33 | 8,443 | Yahoo | Adjusted OHLC observed | 1,487.2 | 238.3 | HIGH |
| QQQ | ETF | 1999-03-10 | 2026-08-14 | 26 | 6,901 | Yahoo | Adjusted OHLC observed | 1,095.2 | 190.1 | HIGH |
| BTC-USD | Crypto | 2014-09-17 | 2026-08-14 | 11 | 4,350 | Yahoo | Raw crypto OHLC | 3,205.6 | 134.9 | HIGH |
| ETH-USD | Crypto | 2017-11-09 | 2026-08-14 | 8 | 3,201 | Yahoo | Raw crypto OHLC | 1,659.9 | 124.6 | MEDIUM |

Provider latency is observational and not a performance guarantee. FMP returned rate-limited/unavailable responses for the crypto MAX requests; the configured router selected real Yahoo history. No demo data was used.

## Quantitative coverage

- Current YTD is rendered independently and excluded from historical curves, probability, monthly averages and directional series.
- The current incomplete month is visible but excluded from aggregate rows.
- Best-year and window correlations consume only the candidate segment corresponding to current YTD. Altering candidate prices outside that segment does not alter ranking.
- Best correlated year is compared with an independently calculated Pearson ranking; there is no hardcoded year.
- Window membership is asserted exactly for 1/3/5/7/10/15/20/25/MAX.
- Equity weekend boundaries advance to the next valid start session and retreat to the previous valid end session. Crypto Saturdays and Sundays remain valid.
- Cross-year ranges, LONG/SHORT symmetry and adjusted intraperiod high/low excursions are covered.
- Split-adjusted equity and dividend-adjusted ETF fixtures contain no artificial `-90%` or `+900%` event.
- Crypto uses raw OHLC, retains all seven UTC weekdays and does not apply dividends.
- Insufficient 10/15/20/25-year crypto windows remain unavailable with no fabricated points.
- AAPL/NVDA cache keys and histories remain symbol-specific.
- Persisted last-known-good history is used when runtime providers fail.
- A persisted canonical history prevents a repeated MAX provider request for a second configuration of the same symbol.

## UI and E2E coverage

Component tests assert the presence and interaction of Seasonality charts, correlations, trade-stat donuts, LONG/SHORT, historical rows, monthly matrix, probability, average return, Daily/Weekly/Monthly charts, series settings, date and month selectors, help panels and both CSV controls. Existing responsive layout breakpoints and chart containers are unchanged.

The server page remains responsible for loading provider/database data and passes a serializable `SeasonalityAnalysis` into the client explorer. The client contacts only the same-origin `/api/analysis/seasonality` route. Provider code and credentials remain server-only.

## Security and limitations

- No API keys, cookies, provider headers or raw provider payloads are emitted by the audit.
- No client-side provider request was added.
- The `source`, `provider`, sample size, quality, first/last date and history hash remain visible for provenance.
- Market-history corrections made upstream may change future audit values while leaving formulas deterministic.
