# Company Intelligence — repository audit

## Scope and baseline

The repository is a Next.js 16 App Router application written in TypeScript and Tailwind CSS. Company Intelligence extends the existing instrument experience; it does not replace the provider layer, quant engines, authentication, account features, or visual system.

## Reusable platform inventory

| Area | Existing implementation | Company Intelligence use |
| --- | --- | --- |
| Instrument resolution | `FinancialProviderRouter.search`, Yahoo symbol normalizer, `/api/market/resolve` | Resolve company name or ticker and reject unsupported instrument types |
| Market data | Yahoo, Massive and FMP market adapters | Current quote, OHLCV, market state and provenance |
| Fundamentals | FMP/Yahoo adapters and `FundamentalAnalysis` | Summary fundamentals, statements, ratios and analyst consensus |
| Technical analysis | `src/engines/technical` | Momentum, volatility, support/resistance and daily outlook |
| Fundamental analysis | `src/engines/fundamental` | Historical metrics and input normalization |
| DCF and targets | `src/engines/dcf`, `src/engines/targets` | Scenario valuation and composite targets |
| Signals and regime | `src/engines/signals`, `src/engines/regime` | Momentum/risk overlay; not a substitute for company quality |
| Forecast | `src/engines/forecast` | Probabilistic short/medium-horizon context |
| Seasonality | `src/engines/seasonality` | Sample-aware seasonal assessments |
| News intelligence | Alpha Vantage/Yahoo adapters and `src/engines/news` | Sourced catalysts, sentiment and risk evidence |
| Calendar | Earnings, dividends and macro services | Operational calendar and known events |
| Backtesting | Bias-controlled backtest engine and repository | Decision-model validation without future leakage |
| Persistence | Drizzle ORM over PostgreSQL | Append-only/versioned company-analysis snapshots |
| Authentication | Server-side signed sessions | Protect refresh, exports, saved reports and costly calculations |
| Cache/limits | Upstash Redis with bounded local fallback | Per-stage TTL, distributed locks and per-IP rate limits |
| API envelope | Request context, correlation IDs, standard errors | Uniform company endpoints |
| UI | Instrument shell, cards, charts, tables and responsive CSS | New `analysis` tab with the current Kairo identity |

## Existing instrument routes

The dynamic route is `/instrument/[market]/[symbol]`. Existing sections cover overview, signals, forecast, targets, seasonality, patterns, momentum, fundamentals, policy and news. Company Intelligence is added at `/instrument/[market]/[symbol]/analysis` and linked as **Complete analysis**.

## Data availability

| Classification | Data |
| --- | --- |
| Direct facts | quote, OHLCV, market cap, profile, summary fundamentals, provider-supported statements/ratios, analyst consensus, sourced news, earnings/dividend events |
| Calculated | growth, margins, cash conversion, earnings quality, quality scoring, drawdown, volatility, reverse DCF, scenario DCF, margin of safety, horizons, risk ranking |
| Conditional | historical statements, historical ratios, peer comparison, insider activity, guidance history, filings and macro calendar depend on provider plan/coverage |
| Not inferable safely | exact maintenance capex, market share, customer retention, proprietary-data advantage, management incentives, geographic exposure percentages when no structured source exists |

Missing values remain `null` and render as **DATA NOT AVAILABLE** or **NOT APPLICABLE**. No zero substitution and no hidden demo fallback are allowed.

## Gaps to implement

- Company-specific contracts and a partial-failure pipeline.
- Earnings quality, FCF classification and business-quality scoring.
- Evidence-based moat and management assessments.
- Peer selection with explicit confidence and no fabricated peers.
- Historical/comparative multiples and reverse DCF.
- Downside-first risk register, red flags, catalysts and short thesis gate.
- Horizon assessments from intraday to 20 years with uncertainty widening.
- Versioned report snapshots and exports.
- A compact instrument analysis UI with sources and methodology.

## Constraints

- `yahoo-finance2` and every provider adapter remain server-only.
- FMP statement/ratio features stay plan-gated.
- ETF, index, crypto, forex, fund and commodity instruments return `NOT_APPLICABLE` for corporate analysis.
- Long-horizon outputs are scenarios, not deterministic price promises.
- AI-generated text, if ever enabled, must be schema-validated and source-grounded; the default report is deterministic.
