# Quantitative models

All production calculations are pure server-side functions, timestamped and versioned. Missing prerequisites return an unavailable result; no future data or zero substitution is allowed.

## Versions

- Technical indicators remain backward-compatible at `technical-v1.0.0`; the advanced Technical workspace is `technical-v2.0.0` with separately versioned levels, volume-profile and confluence engines.
- Fundamental scoring: `fundamental-v1.0.1`.
- Seasonality: `seasonality-v1.0.0`.
- Multi-horizon signals: `signal-v1.0.0`.
- Targets/risk: `targets-v1.0.0`, `risk-v1.0.0`.
- Forecast: `forecast-v1.0.0`.
- Backtest: `backtest-v1.0.0`.

## Core formulas

- Simple return: `P_t / P_(t-n) - 1`; adjusted close is used for total-return analytics.
- EMA: `EMA_t = alpha * x_t + (1-alpha) * EMA_(t-1)`, `alpha=2/(n+1)`.
- RSI(14): Wilder-smoothed gains/losses; insufficient history yields unavailable.
- ATR(14): Wilder average of max(high-low, abs(high-prevClose), abs(low-prevClose)).
- Annualized volatility: sample standard deviation of log returns times `sqrt(periods/year)`.
- Maximum drawdown: minimum of `equity/runningPeak - 1`.
- CAGR: `(ending/beginning)^(1/years)-1` for positive comparable values.
- Free cash flow: operating cash flow minus capital expenditure, preserving provider sign conventions.
- ROIC: NOPAT divided by average invested capital when all components exist.

## Signals

Component scores are normalized to 0–100 and weighted by horizon. Weights are centralized and renormalized only over available components when completeness remains above a configured threshold. Categories: 0–19 strong sell, 20–39 sell, 40–59 hold, 60–79 buy, 80–100 strong buy. Outputs are model signals, not advice.

## Seasonality

Returns are grouped by calendar/trading position for 1/5/10/15/20/MAX years. Outputs include mean, median, hit rate, standard deviation, percentiles, sample size, confidence interval and stability. One year is descriptive and quality is `INSUFFICIENT` or `LOW`.

## Targets and risk

Analyst, technical, fundamental and composite targets remain separate. Risk plans use ATR, structure and percentage stops; position size is `accountRisk / riskPerShare`. DCF is applicable only to compatible companies with stable positive cash flow.

## Forecast

Bootstrap and block-bootstrap sample historical log returns. Monte Carlo produces distributions and percentiles, never a certain future price. Seeded tests make simulations reproducible. Calibration/coverage are measured on walk-forward historical windows.

## Backtest

Signals generated at bar close execute no earlier than the next bar open unless explicitly configured. Costs, spread and slippage are applied on every fill. Fundamentals/analyst inputs use publication timestamps. Test periods remain out-of-sample.
