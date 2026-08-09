# Stellantis Complete Coverage — data gap audit

Audit date: 2026-08-09
Instrument under test: `STLAM.MI`
Economic issuer: Stellantis N.V.
Baseline branch/commit: `feat/political-intelligence` / `8fd6ec1`
Baseline internal endpoint: `/api/company/STLAM.MI/analysis`

## Baseline result

The pre-fix report resolved the Milan quote and Yahoo profile, but it did not resolve the consolidated issuer identity. The listing was sent unchanged to every fundamentals provider. SEC resolution attempted `STLAM`, while the SEC registrant uses ticker `STLA` and CIK `0001605484`. Even when the issuer was queried directly, the SEC adapter read only `us-gaap`; Stellantis publishes `ifrs-full` Company Facts.

Observed baseline:

- data completeness: 13.125%;
- data quality score: 11.375/100;
- confidence: `LOW`;
- annual and quarterly historical periods: none;
- issuer-level income, balance-sheet and cash-flow stages: unavailable;
- quote/profile/technical stages: available, primarily Yahoo;
- analyst consensus, verified peers, dividends and corporate-insider activity: unavailable or provider-plan limited;
- output verdict: `INSUFFICIENT_DATA`.

`MISSING` remains distinct from zero. Fields that are not economically applicable are marked `NOT_APPLICABLE` and must be excluded from any completeness denominator.

## Verified issuer and listing identity

| Identity | Verified value | Level | Verification source | Baseline status | Fix strategy |
|---|---|---|---|---|---|
| Legal issuer | Stellantis N.V. | issuer | Official IR / SEC | Partial | Canonical issuer resolution by legal-name match |
| SEC CIK | `0001605484` | issuer | SEC ticker map and submissions | Missing for `STLAM.MI` | Resolve direct ticker, CIK, then normalized legal name |
| ISIN | `NL00150001Q9` | issuer/share class | Official Stellantis stock information | Missing | Store as verified canonical identifier |
| LEI | Unresolved in baseline | issuer | ESEF/official registry required | Missing | Keep `MISSING` until a primary registry response is ingested |
| FIGI | Unresolved in baseline | listing | OpenFIGI/provider response required | Missing | Optional alternative provider; never synthesize |
| NYSE listing | `STLA`, USD | listing | Official Stellantis / SEC | Missing | Map to canonical issuer and use for SEC/Finnhub issuer services |
| Euronext Milan listing | `STLAM`, Yahoo `STLAM.MI`, EUR | listing | Official Stellantis | Available only as quote | Preserve as requested trading instrument |
| Euronext Paris listing | `STLAP`, Yahoo `STLAP.PA`, EUR | listing | Official Stellantis | Missing | Add verified sibling listing mapping |
| Reporting currency | EUR | issuer/report | SEC IFRS facts | Missing | Derive from filing fact units |
| Trading currency | EUR | Milan listing | Market profile/quote | Available | Keep separate from reporting currency |

## Stellantis provider symbol map

This table records symbols that are either observed from a provider or verified by an official source. It does not imply that every provider plan exposes every endpoint.

| Provider | Input | Resolved identity | Scope | Currency/exchange | Baseline | Expected result |
|---|---|---|---|---|---|---|
| Yahoo | `STLAM.MI` | `STLAM.MI` | listing | EUR / Milan | OK | Quote, chart, profile only |
| Massive | `STLAM.MI` | unresolved | listing | non-US listing | Unsupported | `NOT_APPLICABLE` for this adapter unless international coverage is added |
| FMP | `STLAM.MI` | provider-dependent | listing/issuer | EUR / Milan | plan/error | Try listing symbol, preserve provider error |
| EODHD | `STLAM.MI` | `STLAM.MI` provider conversion | listing/issuer | EUR / Milan | partial/search only | Structured profile/fundamentals when plan permits |
| Finnhub | `STLAM.MI` | `STLA` issuer alias | issuer supplement | USD / NYSE identity | Baseline incorrectly used `STLAM` | Use SEC-verified US alias for peers/executives/insiders |
| SEC EDGAR | `STLAM.MI` | CIK `0001605484` / ticker `STLA` | issuer | EUR reporting | Failed | IFRS Company Facts and 20-F filings |
| ESEF | issuer identity | unresolved LEI | issuer | EUR reporting | Partial adapter only | Remains unavailable until authoritative filing-package discovery succeeds |
| Alpha Vantage | listing/provider symbol | provider-dependent | news/sentiment | n/a | noisy Yahoo fallback | Attribute only symbol-relevant results |

## UI field-by-field audit

The current Company Intelligence view is generated from the fields below. “Expected provider” is the authoritative first choice, not a guarantee of availability.

| Field | Section | Applicable | Baseline value/status | Baseline provider / attempts | Issuer or listing | Raw or calculated | Required inputs | Expected provider | Fix strategy |
|---|---|---:|---|---|---|---|---|---|---|
| symbol | Summary | Yes | `STLAM.MI` / available | request | listing | raw | route symbol | Yahoo/EODHD | preserve listing symbol |
| name | Summary | Yes | Stellantis N.V. / available | Yahoo | issuer | raw | profile | official/SEC | canonical legal-name match |
| exchange | Summary | Yes | Milan / available | Yahoo | listing | raw | profile | Yahoo/EODHD | preserve listing exchange |
| sector | Summary | Yes | Consumer Cyclical / available | Yahoo | issuer | raw | profile | EODHD/FMP/Yahoo | reconcile classifications |
| industry | Summary | Yes | Auto Manufacturers / available | Yahoo | issuer | raw | profile | EODHD/FMP/Yahoo | reconcile classifications |
| confidence | Summary | Yes | LOW | calculated | issuer/report | calculated | completeness, validations | KAIRO | recompute after verified history |
| overallScore | Summary | Yes | 7.03 / low confidence | KAIRO | issuer/report | calculated | quality, risk, valuation | KAIRO | never increase without inputs |
| verdict / assessment | Summary | Yes | insufficient data | KAIRO | issuer/report | calculated | score + completeness | KAIRO | retain guardrail |
| currentPrice | Price | Yes | 4.789 EUR / available | Yahoo | Milan listing | raw | quote | market provider | unchanged |
| dailyChangePercent | Price | Yes | -1.66% / available | Yahoo | Milan listing | raw | quote | market provider | unchanged |
| marketState | Price | Yes | available | Yahoo | listing | raw | quote | market provider | unchanged |
| marketCap | Price | Yes | available but not reconciled | Yahoo | issuer expressed via listing | calculated/provider | listing price, period-end shares | quote + official shares | validate price × non-duplicated shares |
| fairValue | Price/valuation | Yes | missing | no history | issuer/listing currency | calculated | FCF/history/discount rate/shares | KAIRO | calculate only after validated history |
| marginOfSafety | Price/valuation | Yes | missing | no fair value | issuer/listing | calculated | price, fair value | KAIRO | calculate only when both exist |
| bear/base/bull fair value | Price/valuation | Yes | missing | no history | issuer/listing | model output | financial history/scenario assumptions | KAIRO | calculate with explicit assumptions |
| reverseDcf | Price/valuation | Yes | unavailable | no FCF | issuer/listing | calculated | price, FCF, discount/terminal rates | KAIRO | enable when FCF inputs pass validation |
| dataQuality score | Summary | Yes | 11.375 | KAIRO | report | calculated | availability + checks | KAIRO | denominator uses applicable fields only |
| data timestamp | Summary | Yes | quote timestamp only | Yahoo | mixed | raw | filing/quote timestamps | SEC + market | latest filing for fundamentals |
| growth score | Quality | Yes | missing | no statements | issuer | calculated | revenue history | SEC IFRS | 1/3/5/10Y trends when available |
| profitability score | Quality | Yes | 5.57, summary-only | Yahoo | issuer | calculated | margins/history | SEC IFRS | derive from verified filing facts |
| capital efficiency score | Quality | Yes | missing | no assets/equity | issuer | calculated | NOPAT, invested capital, assets, equity | SEC IFRS | ROA/ROE/ROIC/CROIC with methodology |
| balance-sheet score | Quality | Yes | 0 | no history | issuer | calculated | assets, liabilities, equity, debt, cash | SEC IFRS | validate accounting identity |
| cash-flow score | Quality | Yes | missing | no statements | issuer | calculated | CFO, capex, FCF | SEC IFRS | signed-capex normalization |
| earnings-quality score | Quality/Cash flow | Yes | not assessable | no history | issuer | calculated | CFO, NI, FCF, shares, WC | SEC IFRS | compute only from sufficient periods |
| moat score/categories | Quality/Moat | Partially | uncertain/missing | no structured evidence | issuer | calculated | durable quantitative evidence | filings + KAIRO | do not infer qualitative moat from industry |
| management score | Quality/Management | Yes | all sub-scores missing | no evidence | issuer | calculated | execution/capital allocation/alignment evidence | filings/Finnhub/official | quantify only evidence-backed inputs |
| predictability score | Quality | Yes | missing | no history | issuer | calculated | multi-year dispersion | SEC IFRS | calculate from validated history |
| revenue by fiscal year | Financials | Yes | missing | FMP/EODHD/SEC/Yahoo failed | issuer | raw | IFRS Revenue | SEC IFRS/ESEF | ingest `ifrs-full:Revenue` |
| net income by fiscal year | Financials | Yes | missing | same | issuer | raw | IFRS ProfitLoss | SEC IFRS/ESEF | ingest attributable profit where available |
| FCF by fiscal year | Financials | Yes | missing | same | issuer | calculated | CFO, capex | SEC IFRS | CFO − capex, explicit formula/lineage |
| net debt by fiscal year | Financials | Yes, with caveat | missing | same | issuer | calculated | consolidated debt, cash | SEC IFRS | show consolidated measure; never call it industrial net debt |
| diluted shares by fiscal year | Financials | Yes | missing | same | issuer | raw | adjusted weighted average shares | SEC IFRS | distinguish weighted average from period-end shares |
| gross profit | Quality/history | Yes, calculable | missing | same | issuer | calculated | revenue, cost of sales | SEC IFRS | revenue − cost of sales if not reported |
| operating income | Quality/history | Yes | missing | same | issuer | raw | operating profit | SEC IFRS | ingest `ProfitLossFromOperatingActivities` |
| EBITDA | Quality/history | Conditional | missing | same | issuer | calculated | operating income + D&A | SEC IFRS | mark calculated; do not equate adjusted operating income |
| cash | Balance sheet | Yes | missing | same | issuer | raw | cash and equivalents | SEC IFRS | ingest instant facts |
| total assets | Balance sheet | Yes | missing | same | issuer | raw | assets | SEC IFRS | ingest and validate units |
| goodwill/intangibles | Balance sheet | Yes | missing | same | issuer | raw | IFRS facts | SEC IFRS | keep goodwill separate from other intangibles |
| total debt | Balance sheet | Yes | missing | same | issuer | calculated/raw | current + non-current borrowings | SEC IFRS | sum non-overlapping facts |
| equity | Balance sheet | Yes | missing | same | issuer | raw | equity | SEC IFRS | ingest total equity |
| working capital | Balance sheet | Yes | missing | same | issuer | calculated | current assets − current liabilities | SEC IFRS | explicit formula |
| operating cash flow | Cash flow | Yes | missing | same | issuer | raw | operating cash flow | SEC IFRS | ingest annual duration facts |
| capex | Cash flow | Yes | missing | same | issuer | raw, normalized sign | purchase of PP&E/intangibles | SEC IFRS | normalize outflow to negative |
| cash conversion | Cash flow | Yes | missing | no history | issuer | calculated | CFO / net income | KAIRO | preserve sign and loss-year warning |
| FCF / net income | Cash flow | Yes | missing | no history | issuer | calculated | FCF / net income | KAIRO | preserve sign and loss-year warning |
| FCF margin | Cash flow | Yes | missing | no history | issuer | calculated | FCF / revenue | KAIRO | calculate from same fiscal period |
| FCF yield | Cash flow | Yes | missing | no history | issuer/listing | calculated | latest annual/TTM FCF, market cap | KAIRO | label annual vs TTM |
| risk scores/red flags | Risk | Yes | low-evidence output | partial summary/technical | report | calculated | verified financial/market data | KAIRO | improve evidence, retain confidence penalties |
| seasonality windows | Seasonality | Yes | market-history dependent | Yahoo chart | listing | calculated | adjusted closes | market provider | unchanged |
| daily outlook | Technical | Yes | available | Yahoo chart | listing | calculated | OHLCV | market provider | unchanged |
| analyst targets/count | Valuation | Yes | missing | FMP/EODHD/Yahoo attempts | issuer/listing | consensus | provider symbol alias | FMP/EODHD/Finnhub | try verified provider aliases; otherwise `MISSING` |
| peers | Peers | Yes | empty | FMP/Finnhub failed | issuer | raw + validated | industry/peer endpoints | FMP/Finnhub/EODHD | resolve issuer alias and verify economics |
| peer metrics/percentiles | Peers | Yes when peers verified | missing | no peers | issuer | raw + calculated | peer fundamentals | structured providers/KAIRO | never use unverified static scores |
| execution | Management | Yes | missing | no evidence | issuer | calculated | revenue/margin/FCF/ROIC history | SEC IFRS/KAIRO | time-aware quantitative evidence |
| capital allocation | Management | Yes | missing | no evidence | issuer | calculated | buybacks/dividends/debt/M&A/ROIC | SEC IFRS/official | ingest disclosed flows |
| shareholder alignment | Management | Yes | missing | no evidence | issuer | calculated | shares/buybacks/ownership | SEC/Finnhub/official | keep ownership missing if unavailable |
| credibility | Management | Conditional | missing | guidance not structured | issuer | calculated | guidance/outcomes evidence | official reports | remain missing without structured evidence |
| buybacks | Management/history | Yes | missing | statements unavailable | issuer | raw | treasury-share purchases | SEC IFRS/official | ingest `PurchaseOfTreasuryShares` |
| dividends paid | Management/history | Yes | missing | calendar plan limit | issuer | raw | cash-flow dividend facts | SEC IFRS/official | historical paid cash; event calendar stays separate |
| corporate insiders | Sources/management input | Yes | missing | Finnhub/SEC Form 4 | issuer | raw | manager transactions | Finnhub/European disclosures | SEC Form 4 may be inapplicable to foreign managers; preserve reason |
| congressional political activity | Separate section | Yes as external context | separately implemented | FMP disclosures | issuer | raw/calculated | US disclosures | Political Intelligence | never mix with corporate insiders or company score |
| sources/provenance | Sources | Yes | mostly Yahoo | all attempts | field/report | metadata | provider, timestamp, concept, formula | all | expose SEC concept/accession lineage |
| limitations | Sources | Yes | generic provider failures | pipeline | report | calculated text | errors/missing reasons | KAIRO | make identifier/taxonomy failures precise |

## Fields not directly recoverable from current authoritative sources

- FIGI, until an OpenFIGI-compatible provider is configured.
- LEI and a complete ESEF package index, until an authoritative ESEF registry or filing package is resolved and validated.
- forward analyst revisions and recommendation history when current paid-provider plans do not expose them.
- European manager transactions when no stable, lawful structured endpoint is available.
- management credibility based on historical guidance unless guidance and subsequent outcomes can be normalized with evidence.
- industrial net cash/liquidity and Industrial Free Cash Flow as standardized fields unless the official Stellantis disclosure is ingested with its own definition. They must never be silently substituted for consolidated net debt or standard FCF.
- a qualitative moat score that is not supported by auditable evidence.

## Implementation order

1. Resolve one canonical issuer and verified listing aliases.
2. Route issuer-level calls with the issuer identifier while preserving listing-level quote calls.
3. Add IFRS namespace and concept support to SEC Company Facts.
4. Normalize periods, units, signs and calculated fields with field lineage.
5. Validate balance identity, cash-flow formulas, shares and plausibility.
6. Re-run the live report and document the remaining provider-plan gaps.
7. Add ESEF package ingestion only when a stable authoritative package URL and issuer identity can be verified.
