# Fundamental engine

Model version: `fundamental-v1.0.1`.

The engine receives normalized FMP/Yahoo summary fields plus annual or quarterly income statements, balance sheets, cash-flow statements and ratios. It never calls a provider and never replaces a missing field with zero. The server-side provider router is therefore replaceable without changing calculations or UI components.

## Measures

- Growth: revenue YoY, revenue CAGR 3Y/5Y, EPS YoY/CAGR, free-cash-flow and EBITDA growth.
- Margins: gross, operating, EBITDA, net and free-cash-flow margin.
- Profitability: ROE, ROA, ROIC and asset turnover when supplied.
- Balance sheet: debt/equity, debt/assets, net debt, net debt/EBITDA, interest coverage, current and quick ratios.
- Cash flow: operating cash flow, capex, free cash flow, cash conversion, stock compensation and dividend coverage.
- Valuation: trailing/forward P/E, PEG, EV/EBITDA, EV/revenue, price/sales, price/book, price/free-cash-flow and earnings/FCF/dividend yields.

Each category is scored only over its available metrics. The composite is the arithmetic mean of the available category scores, bounded to 0–100. `dataCompleteness` is the percentage of defined model metrics present in the input. Confidence is `INSUFFICIENT`, `LOW`, `MEDIUM` or `HIGH` based on completeness and historical depth.

No peer or sector percentile is claimed until a point-in-time comparable universe is available. No Altman, Piotroski, Beneish, DCF or product-segment value is relabelled from the generic score. The UI explicitly names the result “Fundamental Score”.

`GET /api/analysis/fundamental?symbol=` returns provider, source timestamp, model version, normalized metrics, component scores, explanations and the exact normalized inputs used. Missing provider entitlements result in a lower-confidence analysis rather than invented fields.

The currently configured FMP credential was verified on 6 August 2026: profile, quote, TTM metrics and TTM ratios are available, while historical statement endpoints return a plan restriction. The UI therefore keeps statement history and the composite score unavailable for that credential until the entitlement changes; this is runtime feature detection, not a hardcoded assumption.
