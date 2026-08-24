# Kairo Charting V1

## Scope

Kairo Charting V1 introduces `lightweight-charts` 5.2.1 as a rendering engine for genuine financial time series. Kairo remains responsible for all data, calculations, labels, interaction state and visual identity. The integration does not use TradingView data, widgets, iframes, proprietary Advanced Charts code or scraped assets.

## Chart audit and rendering decisions

The repository audit identified 26 chart or chart-like exports. Ten genuine time-series views use the shared Lightweight Charts renderer, fourteen categorical or synthetic-domain views remain on Recharts with the shared Kairo theme, and two remain purpose-built CSS visualizations.

| Chart | Engine | Reason |
| --- | --- | --- |
| Main price | Lightweight Charts | Financial time series, volume, zoom and pan |
| Pattern V2 research | Lightweight Charts | Historical path plus forward analogue series |
| Legacy pattern | Lightweight Charts | Temporal analogue comparison |
| Backtest equity | Lightweight Charts | Strategy and benchmark time series |
| Drawdown | Lightweight Charts | Temporal baseline series |
| Shares outstanding | Lightweight Charts | Temporal fundamental series |
| Dividend history | Lightweight Charts | Temporal event/value series |
| DPO and volume | Lightweight Charts | Oscillator time series with volume pane |
| Momentum oscillator | Lightweight Charts | Temporal oscillator with thresholds |
| Political price/disclosure | Lightweight Charts | Price history with dated disclosure markers |
| Seasonality V2 curves | Recharts | Synthetic Jan–Dec progress scale and drag-selection semantics; fake dates are not exposed |
| Seasonality directional | Recharts | Categorical buckets |
| Annual performance | Recharts | Annual categories |
| Forecast distribution | Recharts | Percentile categories |
| Financial and ratio bars | Recharts | Annual categories and grouped metrics |
| Revenue mix and allocation | Recharts | Categorical composition |
| Political activity timeline | Recharts | Mixed categorical bars and aggregate area |
| Global risk history | Recharts | Regime bands and status annotations |
| Market gauge / probability ring | Custom CSS | Purpose-built non-time-series visualizations |

Seasonality formulas, current-year exclusion, no-lookahead logic, correlations, presidential cycles, Average Series Selector state, availability and local storage behavior are unchanged. Pattern Engine V2 calculations and row construction are unchanged; values are converted from decimal returns to display percentages only at the chart adapter boundary.

## Architecture

- `src/components/charts/chart-theme.ts`: semantic color and presentation tokens shared by Lightweight Charts and Recharts.
- `src/components/charts/lightweight/chart-types.ts`: renderer-agnostic Kairo chart definitions.
- `src/components/charts/lightweight/chart-data-adapter.ts`: validation, ascending sort, duplicate handling, timestamp normalization and label preservation.
- `src/components/charts/lightweight/chart-formatters.ts`: price, percent and volume formatting.
- `src/components/charts/lightweight/kairo-time-series-chart.tsx`: one reusable client renderer, tooltip, legend, series lifecycle, marker support, reset, resize and accessibility.
- `src/components/charts/lightweight/lightweight-financial-charts.tsx`: thin financial adapters for existing component contracts.

`lightweight-charts` is dynamically imported inside a client effect. Server components never import or execute it, so SSR and hydration remain safe. Chart creation, subscriptions and `ResizeObserver` ownership are isolated in one lifecycle effect. Data and visibility updates use the existing chart and update series incrementally; removed series are explicitly removed. Unmount removes subscriptions, observers and the chart instance.

## Data and time rules

- Inputs remain owned by the existing server-side providers and services.
- Invalid, null, `NaN` and infinite values are rejected rather than replaced with zero.
- Points are sorted ascending and duplicate timestamps resolve deterministically to the last supplied value.
- ISO intraday timestamps become Unix seconds; daily dates remain UTC business dates, including crypto weekend dates.
- Synthetic Pattern horizons use internal monotonically increasing dates only because Lightweight Charts requires a time coordinate. Visible axis and tooltip labels remain real observed dates or `T-n` / `Reference` / `T+n`; the internal dates are never presented as market dates.
- Changing symbol changes `chartKey`, clears local series visibility and fits the new content. Zoom state is intentionally reset between instruments to prevent cross-asset contamination.

## Interaction and performance

- Mouse wheel and trackpad zoom, pointer drag, horizontal touch movement and pinch zoom are handled locally by the chart engine.
- Reset view calls `fitContent()` and does not request data.
- Legend visibility and Pattern Single Events operate on already-loaded series and do not call providers.
- `ResizeObserver` follows card, sidebar and viewport changes without a window-level listener.
- Canvas resolution is managed by Lightweight Charts for high-DPI displays.
- The dynamic import keeps the chart engine out of the server render path and defers its client cost until a migrated chart mounts.

## Accessibility and export

Every shared chart exposes a chart summary through `role="img"`, `aria-label` and screen-reader-only text. Legend and reset controls are native keyboard-accessible buttons. Tooltip information is an enhancement; series identity and the numeric range remain available without hover. Pattern PNG export replaces live canvases with data-URL snapshots in the cloned export tree before serialization.

## Attribution and license

Lightweight Charts is distributed under Apache-2.0. Each migrated chart keeps the library's official `attributionLogo` link enabled as required by the library notice. Kairo does not imply that TradingView supplies or endorses the financial data.

## Verification contract

The deterministic E2E suite checks initialization, responsive containment, Pattern local interactions and lack of provider refetches. Unit tests cover adapter sorting, duplicate resolution, invalid-point rejection, equity/crypto dates, intraday timestamps and financial formatting. Release gates remain lint, TypeScript, all unit/integration tests, deterministic E2E, production build, secret scan and live-provider smoke.
