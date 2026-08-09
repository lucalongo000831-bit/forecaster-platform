# KAIRO data coverage audit

This audit is the field-level contract between the UI, deterministic engines and the provider stack. A field is never marked available merely because an upstream endpoint exists: it must be mapped, validated and carry provenance.

## Provider roles

| Provider | Primary role | Fallback role | Typical freshness | Principal limitation |
|---|---|---|---|---|
| Massive | US/crypto quote and bars | — | near-real-time or delayed by entitlement | International listings and fundamentals |
| FMP | fundamentals, estimates, calendars, political data | quote/news | intraday/EOD | plan and rate limits vary by endpoint |
| Alpha Vantage | attributed news/sentiment and macro | news | delayed/cached | strict request budget |
| EODHD | international identity, profile, statements and EOD prices | fundamentals/search | EOD | intraday depth and some plan-gated datasets |
| Finnhub | peers, executives, insiders and ETF structure | company facts | cached/EOD | ETF and company endpoints depend on plan |
| CoinGecko | crypto identity, supply, market cap and global context | — | near-live/cached | no verified on-chain analytics in this integration |
| SEC EDGAR | US issuer identity and official XBRL facts | statements/profile | filing-time | US registrants only; taxonomy diversity |
| ESEF | optional European official filings | — | filing-time | ingestion remains jurisdiction/filing dependent |
| Yahoo Finance | broad market fallback | profile/fundamentals/news | delayed/cached | unofficial availability; never primary official filing source |

## Field matrix

| Surface | Field or group | Required normalized model | Direct providers | Calculated | Cache | Missing semantics |
|---|---|---|---|---|---|---|
| Overview | current price, OHLC, change, volume | `MarketQuoteDto` | Massive → Yahoo → FMP → EODHD | daily change when previous close exists | 3s + 30s stale | provider unavailable/rate limit |
| Overview | market cap | quote/fundamentals | Massive/FMP/EODHD/Yahoo; CoinGecko for crypto | price × shares only when both aligned | 5m crypto, 6h equity | not reported |
| Overview | issuer profile | issuer + instrument | SEC/EODHD/FMP/Yahoo | no | 24h + 7d stale | identifier unresolved |
| Overview | dividends | normalized events | FMP/EODHD/Yahoo | yield/trailing growth from real events | 2h + 24h stale | not reported/plan limit |
| Overview | insider transactions | normalized ownership events | Finnhub; SEC Form 4 | net buying and participation | 6h + 7d stale | not reported/not applicable |
| Analysis | technicals | historical OHLCV | Massive/Yahoo/FMP/EODHD | RSI, MACD, SMA, ATR, volatility, drawdown | 1h | insufficient history |
| Analysis | company quality | normalized statements | SEC/FMP/EODHD/Yahoo | deterministic score | 6h | calculation input missing |
| Analysis | earnings quality | normalized income/cash flow | SEC/FMP/EODHD/Yahoo | cash conversion, accrual and FCF quality | 6h | calculation input missing |
| Analysis | moat evidence | statement history + profile | SEC/FMP/EODHD | deterministic quantitative evidence only | 24h | no qualitative evidence invented |
| Analysis | management | statements, executives, insider activity | Finnhub/SEC/FMP/EODHD | execution, capital allocation, alignment | 24h | input missing |
| Fundamentals | income statement | `FinancialStatement` | SEC → FMP/EODHD → Yahoo by availability | normalization only | 6h + 7d stale | not reported/conflict |
| Fundamentals | balance sheet | `FinancialStatement` | SEC → FMP/EODHD → Yahoo | net debt, working capital | 6h + 7d stale | not reported/conflict |
| Fundamentals | cash flow | `FinancialStatement` | SEC → FMP/EODHD → Yahoo | FCF = CFO − abs(capex) | 6h + 7d stale | not reported/conflict |
| Fundamentals | ratios | normalized metrics | FMP/EODHD/Finnhub/Yahoo | derived only with compatible periods/currency | 6h | input missing |
| Targets | street consensus | analyst model | FMP/EODHD/Yahoo | no | 6h + 48h stale | plan limit/not reported |
| Targets | KAIRO fair value | normalized statements | provider-independent | DCF/reverse DCF/scenarios | 6h | input missing, never replaced by analyst target |
| Signals | technical signal | price history | market providers | deterministic score | 1h | insufficient history |
| Forecast | probabilistic bands | historical returns | market providers | historical distribution P10/P50/P90 | 1h | insufficient history |
| Seasonality | month/window statistics | adjusted daily history | market providers | mean, median, hit rate, dispersion | 24h | insufficient history |
| Policy | political transactions | disclosure events | FMP | aggregation only | 6h | plan limit/not reported |
| ETF | AUM, NAV, expense ratio | `EtfProfile` | Finnhub | no | 6h | plan limit/not reported |
| ETF | holdings/allocation | `EtfProfile` | Finnhub | concentration metrics | 6h | plan limit/not reported |
| Crypto | market cap, supply, ATH | `CryptoProfile` | CoinGecko | no | 5m | identifier unresolved/not reported |
| Crypto | global context | crypto global model | CoinGecko | dominance display only | 5m | provider unavailable |
| Crypto | on-chain intelligence | — | none in configured stack | no | — | not available; never fabricated |

## Issuer and instrument identity

An issuer is the legal entity (`legalName`, country, LEI, CIK, ISIN, sector). An instrument is a tradable listing (`canonicalSymbol`, exchange/MIC, trading currency, instrument type). One issuer may have multiple listings and currencies. `instrument_symbols` and `providerSymbols` keep provider-specific identifiers; a 30-day resolver cache prevents repeated identity requests.

## Validation rules

- Statement periods are keyed by period and fiscal end, not by download date.
- Currency and units must be compatible before cross-provider comparisons.
- SEC is preferred as official evidence for US filings; ESEF is the optional official European layer.
- A material cross-provider difference above 3% is a `DATA_CONFLICT`, not a silent overwrite.
- Derived fields list formula and input field paths in provenance.
- Stale data can be served only inside the configured stale window and must retain `STALE` freshness.
- Provider plan failures, rate limits and true non-reporting remain distinct user-facing states.

## Coverage acceptance universe

The live smoke suite covers `STLAM.MI`, `ENI.MI`, `AAPL`, `MSFT`, `NVDA`, `DUOL`, `NOW`, `RKLB`, `SPY`, `BTC-USD`, `ETH-USD`, a malformed symbol and a listing-specific resolution check. UCITS ETF coverage depends on the Finnhub plan and symbol mapping; an explicit plan-limit result is acceptable, demo holdings are not.
