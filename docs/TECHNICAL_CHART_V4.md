# Technical Chart V4

Technical V4 is an additive decision workspace built on the V1–V3 chart, drawing, indicator and structure engines. Its local workspace model is `technical-v4.0.0`; V3 storage is read during migration and remains recoverable.

## Historical range semantics

Interval and historical range are independent controls. Supported ranges are `1D`, `5D`, `1M`, `3M`, `6M`, `YTD`, `1Y`, `3Y`, `5Y`, `10Y`, `MAX` and validated custom dates. `MAX` requests the longest valid series exposed by Kairo's provider router and never aliases one year. The UI discloses the earliest returned observation, bar count, provider and partial/unavailable states. Invalid range/interval pairs return a readable local error while the last valid chart remains visible.

Long-range requests use the existing server cache and single-flight provider router. The browser additionally caches exact symbol/interval/range requests; a cached longer response can remain visible during expansion failures. Provider series are not silently downsampled. Daily/weekly bars preserve the canonical corporate-action policy and crypto weekend observations.

`Fit all data` changes only the viewport. Manual zoom/pan is retained across background refreshes for the same panel/range. A range change deliberately fits the newly selected dataset. Each pane persists its own range; optional range sync is explicit.

Provider limits differ by interval. Intraday history is deliberately constrained and an unsupported combination is not silently changed. `MAX` therefore works best with daily or weekly bars. “Maximum history currently available in Kairo” is a coverage statement, not an IPO/listing-date claim.

## Deterministic calculations

- Position sizing: `risk capital = account size × risk %`; `quantity = risk capital / abs(entry − stop)`; `R = directional reward / directional risk`. Invalid direction or zero risk is rejected. Fractional sizing is explicit.
- Swing quality: 0–100 weighted prominence, spacing, rejection wick and relative-volume evidence, using only observations available at the swing confirmation index.
- Liquidity: equal-high/equal-low clusters use the greater of a price-relative and ATR-relative tolerance. A sweep requires a breach followed by a close back inside the zone.
- Displacement: deterministic body/ATR, close-location and relative-volume evidence.
- FVG: three-candle gaps are available only on the third candle. Fill state uses subsequent observations only.
- Cross asset: exact timestamp intersection, range-specific normalization to 100, rolling 20/60 correlation, covariance beta and annualized realized volatility. Volatility uses square-root-of-observations-per-year scaling: 252 daily sessions for equities, 365 daily observations for crypto, 52 weekly observations, and the corresponding exchange-session or 24/7 intraday frequency. Missing benchmark dates are never fabricated.
- Confluence: a transparent weighted descriptive score. It is not a probability, forecast or recommendation.

## Alerts

The typed registry adds liquidity-sweep, FVG-entry and planner entry/stop/target conditions. These reuse authenticated, user-scoped persistence, cooldowns and the existing daily scheduler. The scheduler can miss intraday transitions between evaluations; the interface states this limitation and never describes daily polling as real-time.

## Performance and safety

Calculations are pure and memoized by their bar inputs. Overlay rendering is bounded to recent relevant annotations while analytical history remains intact. Identical requests are coalesced. The browser never calls a financial provider directly; it calls Kairo's rate-limited Node route, which preserves provider, freshness, source timestamp and last-known-good behavior.

No credentials, provider headers or upstream endpoints are exposed to the client. V4 adds no secrets and no new third-party dependency.
