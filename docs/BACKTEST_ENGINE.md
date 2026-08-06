# Backtest engine

`backtest-v1.0.0` is a bounded, single-symbol research engine. It supports long,
short or both directions, trend/momentum, SMA-cross and 20-day breakout rules,
next-open or next-close execution, signal exits, percentage stop/target,
trailing stop, maximum holding period, commission, spread, slippage,
reinvestment and a benchmark curve.

## Bias controls

- Every signal is calculated from data through the previous session close.
- Default execution is the next session open; next close is also available.
- No future fundamentals, analyst revisions or news enter the current rules.
- OHLC values are scaled with each bar's adjusted-close factor for splits and
  distributions.
- When stop and target are both touched in one daily bar, the stop is assumed to
  occur first.
- The engine never optimizes parameters against the selected test range.

Metrics include total return, CAGR, annualized volatility, Sharpe, Sortino,
Calmar, maximum drawdown and duration, win/loss rates, average win/loss, payoff,
profit factor, expectancy, exposure, turnover, trade count, holding period,
best/worst trade, benchmark return, alpha and beta.

## Serving and persistence

`POST /api/backtests` accepts one symbol and at most 15 years, limits request
size and IP frequency, and uses the Node.js runtime. In production it requires
both `ENABLE_BACKTEST_API=true` and an authenticated user. Authenticated results
are stored with configuration hash, metrics, curve and trades when PostgreSQL is
configured; otherwise the result is explicitly session-only.

The engine does not solve survivorship bias for a single current ticker, borrow
availability, funding, tax, FX or intraday path ambiguity. Historical results
are not indicative of future performance.
