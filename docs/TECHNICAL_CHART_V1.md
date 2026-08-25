# Kairo Technical Chart V1

## Purpose

Technical Chart V1 is a descriptive market-research terminal built on Lightweight Charts 5.2.1. It renders one canonical OHLCV dataset per symbol and timeframe, then calculates every visible study locally from that immutable dataset. Indicator toggles never contact a financial provider.

The model version is `technical-v1.0.0`. Outputs are research context, not BUY/SELL instructions or forecasts.

## Data flow

1. The client requests `/api/analysis/technical-chart` with a validated symbol and timeframe.
2. The Node.js route applies per-IP rate limiting and calls the server-only financial provider router.
3. The provider router applies its existing provider priority, timeout, cache and stale fallback policies.
4. Invalid, duplicate, non-finite and structurally impossible bars are removed.
5. Equity and ETF daily/weekly bars use adjusted OHLC when an adjusted close is reported. The adjustment factor for a bar is `adjustedClose / close`, applied to open, high and low; close becomes adjusted close. Intraday and crypto bars remain raw.
6. The client receives serializable Kairo data and metadata. It never contacts Yahoo, Massive, FMP or another upstream provider directly.

## Supported timeframes

| UI | Provider request | Notes |
| --- | --- | --- |
| 1m | 1D / 1m | Provider availability and retention apply |
| 5m | 5D / 5m | Raw intraday OHLC |
| 15m | 5D / 15m | Raw intraday OHLC |
| 30m | 1M / 30m | Raw intraday OHLC |
| 1h | 1M / 1h | Raw intraday OHLC |
| 4h | 1M / 1h | Calculated only from buckets containing four distinct complete 1h bars |
| 1D | 1Y / 1d | Adjusted equity/ETF policy; crypto raw |
| 1W | 5Y / 1wk | Adjusted equity/ETF policy; crypto raw |

No candle is synthesized from close-only data. A missing or incomplete source produces an unavailable state.

## Indicator formulas

- SMA(n): arithmetic mean of the current and previous `n - 1` closes.
- EMA(n): smoothing factor `2 / (n + 1)`, seeded with the first complete n-period SMA.
- Bollinger(n, k): SMA(n) plus/minus `k` times population standard deviation; V1 defaults to n=20 and k=2.
- RSI(n): Wilder smoothed average gains and losses; V1 defaults to 14.
- MACD(12,26,9): EMA(12) minus EMA(26), with a 9-period EMA signal and MACD-minus-signal histogram.
- ATR(n): Wilder smoothing of true range; true range is the maximum of high-low, absolute high-previous-close and absolute low-previous-close.
- VWAP: cumulative typical-price times volume divided by cumulative volume, reset on each UTC calendar day. This matches the canonical crypto session and prevents equity observations from leaking into a later session. V1 exposes VWAP only on intraday timeframes with positive volume; exchange-specific anchored VWAP remains future scope.
- Compare: `(close / first valid close at or after the shared start - 1) × 100`. The primary instrument and every comparison omit earlier points, then each begins at 0% on its first valid observation at or after the common boundary.

Warm-up periods are `null`, never zero. Non-finite outputs are never rendered. All algorithms are causal: a prefix produces the same results as the corresponding prefix of a longer input.

## Panes and interaction

- Pane 0: candlestick, line or area price; price overlays; up to three normalized comparisons; persisted drawings.
- Pane 1: volume when enabled.
- Additional synchronized panes: RSI, MACD and ATR in enabled order.
- One crosshair and time scale synchronize the panes naturally within one Lightweight Charts instance.
- Scroll zoom, drag navigation, pinch zoom, resizable pane separators, reset view and fullscreen are supported.
- Drawings V1 includes horizontal levels and two-point trend lines. They are stored by symbol and timeframe.

Preferences use the versioned local key `kairo:technical-chart:v1:<SYMBOL>` and contain chart type, timeframe, indicator registry, comparisons and drawings. Reset removes this local workspace state.

## Caching and failure behavior

- Intraday server response: `s-maxage=10`, `stale-while-revalidate=60`.
- Daily/weekly server response: `s-maxage=900`, `stale-while-revalidate=21600`.
- The provider router maintains its own server-side fresh/stale cache and provider fallback.
- The client keeps an in-memory response cache and makes at most one controlled retry after 250 ms.
- Changing studies, chart type, drawings or visibility causes no provider request.
- Changing symbol, timeframe or comparison may request a new canonical dataset.
- On a refresh error the last verified snapshot stays visible with an explicit warning. Initial failure presents a readable retry state.

## Validation and security

Symbols use Kairo’s strict allowlist and support international suffixes, dots, hyphens, `^` and `=`. Timeframes are an enum. The endpoint runs in the Node.js runtime, never exposes provider credentials, and inherits sanitized server logging. No provider package is imported by a client component.

## Test policy

Golden tests cover adjustment, invalid data, complete 4h aggregation, Bollinger, MACD, VWAP and comparison normalization. Existing technical tests cover SMA, EMA, Wilder RSI/ATR and no-lookahead prefixes. Playwright uses Kairo’s deterministic provider fixture, checks responsive chart rendering, local persistence and confirms indicator changes do not trigger a data refetch.

## Known limitations

- Lightweight Charts does not include TradingView’s built-in indicator library. Every Kairo study is independently implemented, versioned and tested.
- Lightweight Charts does not provide the complete TradingView drawing toolbox. V1 deliberately implements only horizontal levels and two-point trend lines.
- Upstream intraday retention differs by provider and venue. A timeframe can therefore be unavailable for an otherwise valid symbol.
- Comparison lines use their own available timestamps and a normalized percentage scale; V1 does not interpolate missing market sessions.
- VWAP uses a UTC-day reset and is not user-anchored or exchange-timezone selectable in V1.
- Drawings are stored in the current browser only and do not sync to the user account.

## Future V2 roadmap

Potential V2 work includes Fibonacci retracement, a verified support/resistance engine, Heikin Ashi, technical alerts, reusable indicator templates, multi-chart layouts, synchronized multiple-symbol workspaces, advanced drawing tools, volume profile and a technical screener. None of these are implemented or implied by V1.
