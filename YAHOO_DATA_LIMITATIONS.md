# Yahoo Finance data limitations

This document records what the current `YahooFinanceProvider` can source, calculate, or cannot truthfully populate. The UI must preserve provenance: `yahoo` means normalized provider data, `calculated` means a deterministic formula over Yahoo history, `mock` means an explicit demo fallback, and `unavailable` means no value is shown.

## Directly available

Depending on instrument and exchange, `yahoo-finance2` can provide:

- symbol, name, quote type, exchange, currency, and market state;
- regular-market price, change, percent change, open, previous close, daily high/low, volume, and market cap;
- historical timestamp, open, high, low, close, adjusted close, and volume;
- country, sector, industry, description, employee count, and website for supported companies;
- selected valuation and financial fields such as enterprise value, EPS, P/E, price/book, dividend rate/yield, revenue, free cash flow, ROE, debt/equity, margins, and shares outstanding;
- news metadata: title, publisher, publication timestamp, link, and related symbols.

Coverage is not uniform. Indices, currencies, cryptoassets, funds, and some international listings may legitimately omit company profiles or fundamentals. Missing values remain `null`/“Dato non disponibile”.

## Formulas implemented

Calculations use only finite, non-null historical points after OHLCV validation. Long-horizon returns, drawdowns, seasonality, patterns, and momentum use Yahoo adjusted close when available (falling back to close) so splits and distributions do not create artificial performance jumps. Interactive OHLC displays keep the unadjusted exchange values.

### Period return

For the nearest observation at or after the requested lookback date:

```text
return_pct = (latest_close / base_close - 1) × 100
```

YTD uses the first available close in the current UTC calendar year. Annual performance uses the first and last available close per UTC year.

### Drawdown

For each observation `t`:

```text
running_peak_t = max(close_0 … close_t)
drawdown_pct_t = (close_t / running_peak_t - 1) × 100
```

### Seasonality

MAX monthly closes are converted to sequential monthly returns. Returns are grouped by UTC month, and the arithmetic mean is calculated for each month. The best month is the largest mean monthly return. Positive-year percentage is the share of calendar years whose last close is above their first close. This is historical description, not a forecast.

### Rolling pattern statistics

The 5-year series is split into non-overlapping 21-observation windows. Each window records close-to-close performance, maximum rise, and maximum drop relative to its first close. Bullish probability is:

```text
bullish_windows / available_windows × 100
```

This is a simplified historical frequency and is not pattern recognition, correlation, or predictive probability.

### Momentum

- SMA(20) and SMA(50): arithmetic mean of the available trailing 20/50 closes.
- RSI(14): simple rolling average gains divided by simple rolling average losses; the implementation does not use Wilder smoothing.
- DPO-like display: `close - SMA(20)`; the comparison series is `close - SMA(50)`.
- 20D speed: `(latest_close / close_20_observations_ago - 1) × 100`.
- Mood: RSI >= 70 is `Overbought`, RSI <= 30 is `Oversold`, otherwise `Neutral`.

### Watchlist signal

This label is deliberately simple and documented:

```text
BUY  when daily_change_pct >= +0.75
SELL when daily_change_pct <= -0.75
HOLD otherwise
```

It is not an investment recommendation.

## Chart compatibility

Default mappings are:

| Range | Default interval |
| --- | --- |
| 1D | 5m |
| 5D | 15m |
| 1M | 1h |
| 3M | 1d |
| 6M | 1d |
| YTD | 1d |
| 1Y | 1d |
| 5Y | 1wk |
| 10Y | 1wk |
| MAX | 1mo |

The API rejects incompatible explicit intervals. Null, invalid, or non-finite OHLCV points are removed. A range with no valid point returns an unavailable state or an explicitly labelled demo fallback.

## Not directly available from Yahoo

The following interface features cannot be populated directly and uniformly by the current provider:

- political/elected-official transaction disclosures;
- licensed full-text news articles and generated editorial recaps;
- full earnings-call transcripts;
- proprietary DCF, Peter Lynch, EVA, peer fair-value, and combined fair-value scores;
- Altman/Piotroski/Beneish histories without complete, consistently typed statements;
- standardized revenue by product/segment across issuers;
- reliable sector benchmark comparisons;
- complete macroeconomic, IPO, and corporate-event calendar;
- authenticated portfolio holdings, watchlist persistence, and personal events;
- the assistant’s narrative intelligence.

Political data needs an official disclosure dataset or specialist provider. Transcripts and article bodies need licensed sources. Segment data generally needs filings/XBRL parsing or a specialist fundamentals provider. Personal data needs an application database.

## Operational caveats

Yahoo Finance is an external, unofficial market-data dependency with no uptime or schema guarantee for this application. Data can be delayed, corrected, throttled, regionally unavailable, or removed. Exchange suffixes and currencies must be preserved; prices from different currencies must never be aggregated without FX conversion.

The provider router uses shared Upstash Redis cache/rate limiting when configured and a bounded process-local fallback during development. No cookie, crumb, internal header, raw Yahoo endpoint, or IP address is returned to the browser or written to application logs.

When Yahoo fails, the application first attempts an entitled alternative provider. Centralized mock data is used only with an explicit `mock` source and visible demo label. Unsupported real-world facts are never synthesized.
