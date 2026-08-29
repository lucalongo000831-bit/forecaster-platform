# Kairo Technical Chart V2

Model version: `technical-v2.0.0`

Renderer: `lightweight-charts` (route-scoped dynamic import)

Data source: the existing Kairo server-side Technical Chart route

Technical Chart V2 extends the V1 renderer, indicator engine, OHLC service and provider router. React never contacts a market-data provider directly. One canonical dataset is loaded per unique symbol/timeframe, and identical requests across panels or comparisons share both a client in-flight operation and the existing server cache/provider layer.

All outputs are historical, descriptive research context. They are not recommendations, price targets or probabilities of profit.

## Backward compatibility and persistence

V2 stores workspace state under `kairo:technical:v2:<SYMBOL>`. The V1 key `kairo:technical-chart:v1:<SYMBOL>` is read once as a migration source when no valid V2 workspace exists and is never deleted or overwritten. Chart type, timeframe, valid indicators, comparisons, horizontal lines and trend lines are migrated. Corrupt or unsupported state falls back to a clean V2 workspace.

Drawings are keyed by canonical `symbol:timeframe`. Panels showing the same symbol/timeframe intentionally share the same research marks. Layout, panel symbols/timeframes, chart type, indicators, comparison symbols, link settings, feature visibility, drawings and custom templates are stored locally. Text notes are stripped of control characters and angle brackets, collapsed to one-line text and limited to 120 characters. No sensitive data belongs in this schema.

## Heikin Ashi

Heikin Ashi is a derived display only. Indicators continue to use real canonical OHLCV.

- HA close: `(open + high + low + close) / 4`
- First HA open seed: `(real open + real close) / 2`
- Later HA open: `(previous HA open + previous HA close) / 2`
- HA high: `max(real high, HA open, HA close)`
- HA low: `min(real low, HA open, HA close)`

The chart and accessible description label these candles as `DERIVED`; they must not be interpreted as traded OHLC.

## Fibonacci drawings

Retracement uses two ordered user anchors and ratios `0, 0.236, 0.382, 0.5, 0.618, 0.786, 1`. For anchors A and B, the level is `B - (B - A) × ratio`. This preserves both low-to-high and high-to-low direction.

Extension uses three anchors A, B and C and ratios `0.618, 1, 1.272, 1.618, 2`. Its geometry is `C + (B - A) × ratio`. Every rendered level contains both ratio and asset-precision price. V2 supports selection, visibility, deletion and recreation; anchor dragging is not implemented.

## Advanced drawing registry

The shared registry defines identity, label, anchor count, description and text capability for horizontal line, trend line, horizontal ray, vertical line, rectangle/zone, Fibonacci retracement, Fibonacci extension, text note and anchored VWAP. Serialization validation uses the same registry. User drawings render above automatic levels and the selected drawing has stronger visual emphasis.

Direct canvas hit-testing and anchor dragging are not implemented in V2. Selection is deterministic through the drawing list. This avoids fragile zoom-dependent hit regions while preserving reliable delete/toggle/recreate workflows.

## Automatic support and resistance

`technical-levels-v1.0.0` operates only on the selected canonical OHLCV prefix. It requires at least 30 sanitized bars.

1. A volatility-aware pivot detector identifies highs/lows using a configurable symmetric width.
2. Nearby swing prices are clustered using the maximum of `0.35 × ATR(14)`, `0.25% × current price` and a precision floor.
3. Clusters need at least two touches and are represented as zones.
4. Score (maximum 100) combines:
   - touches, maximum 35;
   - recency, maximum 20;
   - average reaction magnitude, maximum 20;
   - relative touch volume, maximum 15;
   - time-separated touches, maximum 10.
5. Scores below 35 are excluded. At most five support and five resistance candidates render.

Support/resistance role begins from the earliest confirmed pivot in a cluster. A later opposite pivot at the same zone marks the corresponding support-to-resistance or resistance-to-support role reversal as `FLIPPED`. A pure support below its zone or pure resistance above its zone is `BROKEN`; other states are `ACTIVE`, `TESTING` and `STALE`. The `asOfIndex` option slices the input before every calculation, which is independently tested against the equivalent historical prefix to prevent lookahead. Symmetric pivots are emitted only after the configured right-side confirmation window exists, so historical real-time use observes that confirmation delay.

## Visible-range volume profile

`volume-profile-v1.0.0` uses only loaded OHLCV bars and performs no provider fetch on toggle, pan or zoom. It is an **estimated volume-at-price from bar data**, not an exchange tick profile.

The visible price range is divided into 24 equal bins. Each bar's volume is distributed uniformly across every half-open bin intersecting its low/high range; a high exactly on a boundary does not also allocate into the next bin, while the final range boundary remains included. This conserves the visible source volume without edge double counting. POC is the first lower-priced bin with maximum allocated volume. The 70% value area starts at POC and expands to the adjacent bin with more volume; equal adjacent volumes deterministically choose the lower bin. Expansion stops when cumulative selected volume reaches at least 70%, and VAH/VAL are the selected area's outer bounds. Missing or zero real volume returns `UNAVAILABLE`, never a fabricated zero profile.

Visible-range updates are debounced by 120 ms. Calculations are memoized by bars and range and never run on crosshair movement.

## Anchored VWAP

The user selects one timestamp. From that anchor forward, the engine accumulates typical-price volume:

`AVWAP(t) = Σ(((high + low + close) / 3) × volume) / Σ(volume)`

It does not reset at sessions. Pre-anchor values are null. It uses only the already-loaded canonical OHLCV series.

## Multi-chart workspace and linking

Layouts are one chart, two vertical, two horizontal and four-grid. Each panel owns its symbol, timeframe, chart type, indicators and comparisons. One panel is active and receives global toolbar actions. A panel can maximize and return to its grid without losing state. Only visible panels mount chart renderers.

Crosshair linking sends an ISO timestamp to the other visible panels. A destination shows a crosshair only if it has a bar at exactly that timestamp; missing bars are not fabricated. A programmatic-update guard prevents recursive synchronization. Symbol and timeframe links are independently opt-in. Request planning deduplicates identical symbol/timeframe pairs.

## Templates

Built-in templates are Clean, Trend, Momentum, Volatility, Swing and Multi-Timeframe. The latter creates a linked four-grid for `1D`, `4h`, `1h` and `15m`. Up to 20 version-validated custom templates can be stored locally. Templates contain layout, panel timeframes/chart types/indicators, links and feature visibility; user drawings are intentionally excluded.

## Technical confluence

`technical-confluence-v1.0.0` combines price/EMA20/EMA50 alignment, RSI regime, ATR percentage, nearest qualified unbroken support/resistance and estimated profile POC. ATR below 1.2% of price is `LOW`, above 3% is `HIGH`, and the inclusive middle regime is `NORMAL`. It returns trend, momentum, volatility, structure, volume context and `HIGH/MEDIUM/LOW` alignment. Missing structural/profile inputs produce `PARTIAL`. It never returns BUY, SELL or a profit probability.

## Alert definitions

V2 includes a safe local condition selector for price/level/zone, RSI, MACD, EMA and anchored VWAP conditions. Background monitoring and activation are explicitly unavailable because no scheduler integration is included. The UI does not pretend a saved local definition is monitored.

## Performance and network policy

Heikin Ashi, indicators, support/resistance, profile, drawings and confluence are pure client calculations over the loaded dataset. Drawing, editing, toggling, templates, crosshair, zoom and pan issue zero provider requests. A worker was not introduced because the bounded algorithms are linear or near-linear for the chart histories currently returned; this keeps transfer and lifecycle overhead lower. If production profiling shows main-thread blocking with materially larger histories, the pure V2 functions are worker-ready.

The renderer remains dynamically imported inside the Technical route's Client Component, so unrelated application routes do not eagerly load `lightweight-charts` or V2 rendering work.

## Tests and limitations

Independent fixtures cover Heikin Ashi, no-lookahead, Fibonacci in both directions, Fibonacci extension, anchored VWAP, swing detection, clustering, level qualification/deduplication/as-of behavior, volume profile bins/POC/VAH/VAL/value area, missing volume, confluence, migration, drawing preservation/sanitation, panel isolation, link semantics, request deduplication and template schemas.

Known limits:

- profile volume is bar-derived rather than tick-derived;
- drawing selection uses the accessible list; anchor dragging and undo/redo are not implemented;
- vertical markers and zones use the shared lightweight renderer primitives rather than a proprietary drawing SDK;
- PNG export is not included in the existing V1 architecture;
- alert monitoring is not available;
- exact crosshair synchronization requires a common timestamp;
- support/resistance is intentionally hidden when history or score quality is insufficient.
