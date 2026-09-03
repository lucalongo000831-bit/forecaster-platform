# Kairo Technical Chart V3

Model version: `technical-v3.0.0`

Technical V3 is an incremental extension of the verified V2 chart, data route, request cache, multi-panel planner, drawing registry and `lightweight-charts` renderer. It does not introduce a second chart stack. Provider traffic remains server-side through `/api/analysis/technical-chart`; toggles, crosshair movement, drawings, profiles and templates only calculate over already loaded canonical OHLCV.

All outputs are historical, descriptive research context. They are not BUY/SELL instructions, expected returns or probabilities of profit.

## Storage and V2 migration

V3 writes `kairo:technical:v3:<SYMBOL>`. If that key is absent or invalid, it reads the existing V2 and V1 keys and creates a version-3 workspace. The original V2 key is never deleted or overwritten.

Migration preserves valid layouts, panels, chart types, indicators, comparisons, panel links, drawings (including Fibonacci and Anchored VWAP), V2 feature flags and custom templates. New V3 overlays default off, while the accessible structure summary defaults on. Profile definitions are deduplicated by ID and capped at five per symbol/timeframe. Re-reading a migrated workspace is idempotent.

## Market Structure Engine V1

Model: `market-structure-v1.0.0`.

Input is sanitized canonical OHLCV. A swing is visible only after the complete symmetric right-side confirmation window exists. Minor pivots use width 2 by default; major pivots use width 4. A minor pivot is promoted to major when its local displacement is at least 1.8 ATR. This creates a deterministic minor/major hierarchy without retroactive visibility.

Confirmed highs are compared with the prior confirmed high and confirmed lows with the prior confirmed low. A move larger than `max(0.1% of prior pivot, 0.1 ATR)` is labelled HH/HL/LH/LL; near-equal pivots retain neutral H/L labels. The current descriptive state is:

- `UPTREND`: latest high is HH and latest low is HL;
- `DOWNTREND`: latest high is LH and latest low is LL;
- `RANGE`: neutral pivots or a recent swing range within `max(10 ATR, 5% of price)`;
- `TRANSITION`: sufficient but conflicting structure outside that range;
- `INSUFFICIENT_DATA`: fewer than two confirmed highs or lows.

In an uptrend, the latest confirmed structural low is protected; in a downtrend, the latest structural high is protected. A close through the continuation-side structural level is BOS. A close through the protected opposite-side level is CHOCH. Wick-only breaks do not qualify. One broken level produces one event. Every event records the break timestamp, confirmation/availability timestamp, structural state before and after, the broken swing and displacement-based confidence. BOS and CHOCH are mutually exclusive at each bar.

The `asOfIndex` path slices input before pivot, ATR, state and event calculation. Mutating bars after the as-of boundary cannot change historical results.

## Multi-timeframe structure and levels

The structure matrix evaluates 15m, 1h, 4h and 1D data already deduplicated by the V2 request planner. Missing histories produce `INSUFFICIENT_DATA`, never synthetic structure.

MTF levels reuse V2's independently validated S/R engine. Each candidate retains its source timeframe. Documented structural weights are 1m 0.50, 5m 0.65, 15m 0.80, 30m 0.90, 1h 1.00, 4h 1.30, 1D 1.70 and 1W 2.10. Same-role candidates cluster when their weighted centers are within the greatest of 0.4% of price, 1.5 times the current cluster width, or the candidate zone width. The center is timeframe-weighted. The score is the weighted source score plus eight points for each additional represented timeframe, capped at 100. At most eight qualified zones render.

Each timeframe is computed only from the supplied prefix. A historical intraday query never reads future daily data.

## Volume Profile V3

Visible Range retains V2's `volume-profile-v1.0.0` implementation. Fixed Range uses user-selected start/end timestamps. Anchored Profile uses a selected start and extends to the latest bar unless an end is supplied. Bars outside the selected interval contribute zero volume.

All profiles reuse the conservation-safe uniform bar-range allocation. They are estimates from aggregated OHLCV, not exchange tick volume-at-price. Defaults are 24 bins and 70% value area; accepted bounds are 4–200 bins and value area strictly between 0 and 100 percent. Invalid configuration or missing real volume returns `UNAVAILABLE`. POC/VAH/VAL are recalculated locally. Only profile definitions are persisted, not computed arrays. The workspace caps definitions at five per dataset and distinguishes visible, fixed and anchored levels.

## Divergence Engine V1

Model: `technical-divergence-v1.0.0`.

The engine supports regular bullish and bearish RSI(14) and MACD-line divergence. It compares adjacent same-kind confirmed price pivots. The oscillator extremum must be within one bar of the price pivot by default; unrelated extrema are rejected. A bullish divergence requires price lower low by at least 0.15% and oscillator higher low by more than 0.25 units. Bearish uses the inverse. Pivots must be separated by at least twice the pivot width.

A divergence is available only after the second price pivot's right-side confirmation window and aligned oscillator observation are available. Strength (0–100) transparently combines price displacement, oscillator displacement and bar separation; it is not a reversal or profit probability. The as-of path is prefix-only and tested against future mutations.

## Confluence V2

`technical-confluence-v2.0.0` combines local structure, higher-timeframe structure, MTF S/R, RSI, MACD histogram, V2 bar-based profile location and confirmed divergence. It returns descriptive structure, HTF alignment, momentum, volume location, divergence, nearest testing zone and HIGH/MEDIUM/LOW/PARTIAL alignment. It never returns a trade instruction or profit probability.

## Session analytics

For equities and ETFs with actual 1m/5m/15m/30m data, the engine calculates previous-session high, low and close plus current-session open. OR15 and OR30 require source resolution no coarser than the requested opening range and a complete number of bars. Exchange-local dates use New York by default, Europe/Rome for Milan, Europe/London for London and Asia/Tokyo for Tokyo identifiers.

Crypto is explicitly `CRYPTO_24_7` and does not inherit equity open or opening-range semantics. Those fields remain unavailable rather than being relabelled as an exchange session.

## Server-side technical alerts

V3 reuses the existing authenticated alert table, ownership checks, internal notification channel, deduplicated `alert_events`, distributed job lock and cron endpoint. There is no parallel database or expression interpreter.

The typed registry supports price crossing a level, entering/exiting a zone, confirmed BOS/CHOCH, RSI crossing, MACD line/signal crossing, confirmed bullish/bearish RSI or MACD divergence, price crossing EMA or Anchored VWAP, and price crossing POC/VAH/VAL. Parameters are validated with bounded schemas; arbitrary expressions and `eval` are not allowed.

The Vercel Hobby-compatible scheduler calls `/api/cron/alerts` once per day. Active technical rules are grouped by canonical `symbol:timeframe`; one server dataset evaluates every rule in that group. First evaluation establishes state without notifying. Later notifications occur only on a state transition or a newly confirmed event. A default 60-minute cooldown (one day for 1D/1W rules created by the chart) prevents duplicate delivery. Technical rules remain active after a trigger. A higher-frequency schedule requires a Vercel plan that supports it or an authenticated external scheduler; the UI never claims near-live monitoring from the daily schedule.

`STALE`, `UNAVAILABLE`, request failure or insufficient inputs produce `DEFERRED_DATA_UNAVAILABLE` and never a notification. Delayed/end-of-day data remains honestly labelled by its provider metadata. Alert CRUD remains user-scoped in SQL (`userId` and alert ID); one account cannot update or delete another account's rule. Existing alerts and schema remain backward compatible, so no database migration is required.

Triggered notification history uses the existing `alert_events`. The current evaluated/deferred state and reason are stored in the alert configuration and shown with the rule. Email and SMS are not added.

## Templates and presentation

V3 adds Structure (1D/4h/1h/15m four-grid), Divergence (price/volume/RSI/MACD) and Volume Intelligence (candles/volume/EMA/VWAP/profile). Existing built-in and custom V2 templates remain valid. Default overlays remain clean; major structure labels are the default density, while all confirmed labels are opt-in.

Overlay priority is candles, user drawings, major structure, MTF zones/profiles and minor annotations. Structure and divergence summaries are also exposed as text for keyboard and screen-reader users.

## Performance and known limitations

Pure structure, MTF, profile and divergence functions are memoized outside crosshair state. Crosshair movement does not recalculate them or issue network calls. Identical panel and MTF requests retain V2 single-flight behavior. Benchmarks cover 5,000 bars and four timeframes.

Known limitations:

- bar-based volume allocation is not tick-level market profile;
- deterministic market structure is one documented methodology, not universal market truth;
- divergence is descriptive and not a guaranteed reversal signal;
- external provider history limits can leave a timeframe or session metric unavailable;
- fixed/anchored ranges must currently lie within the loaded Technical dataset; no direct provider call is made from the client;
- the repository's Vercel Hobby cron cadence is daily, so technical conditions are not near-live; a supported higher-frequency scheduler is required for intraday monitoring;
- triggered events have durable notification history; evaluated/deferred state is the latest durable state, not an unbounded per-run audit log.
