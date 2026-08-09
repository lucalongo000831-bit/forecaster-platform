# Stellantis Complete Coverage — final report

> Historical first-pass report. Superseded by [STELLANTIS_COMPLETE_COVERAGE.md](./STELLANTIS_COMPLETE_COVERAGE.md) and the field-by-field [STLAM_REMAINING_GAPS.md](./STLAM_REMAINING_GAPS.md). Its earlier “core-field” percentage is not comparable with Completeness V2 and must not be used as the current coverage result.

## Outcome

The Stellantis initiative resolves `STLAM.MI` as one economic issuer and keeps issuer-level financial statements separate from listing-level market data. The live local verification on 2026-08-09 produced:

| Check | Result |
| --- | --- |
| Applicable core-field completeness | 100% |
| Data-quality score | 94/100 |
| Data-quality confidence | Very high |
| Company-analysis confidence | High |
| Comparable annual periods | 5 (2021–2025) |
| Duplicate fiscal periods | None |
| Balance identity | Pass for every period |
| Stale annual filing data | No |

The 94/100 score is intentionally not promoted to 100. Yahoo's listing market-cap value diverged by 23.1% from the reconciled value. KAIRO uses the current Milan price multiplied by official period-end common shares and records the divergence as a warning.

## Canonical issuer and listings

| Identity | Verified value | Scope |
| --- | --- | --- |
| Legal issuer | Stellantis N.V. | Issuer |
| SEC CIK | `0001605484` | Issuer |
| Common-share ISIN | `NL00150001Q9` | Issuer/security |
| Reporting currency | EUR | Issuer |
| Milan listing | `STLAM`, Yahoo `STLAM.MI`, EUR | Listing |
| Paris listing | `STLAP`, Yahoo `STLAP.PA`, EUR | Listing |
| New York listing | `STLA`, USD | Listing |
| Comparable-history start | 2021-01-01 | Post-merger issuer |

LEI and FIGI remain missing because no configured authoritative registry returned a verified value. They are not inferred.

## Provider symbol map

| Provider | Input | Resolved identifier | Usage | Status |
| --- | --- | --- | --- | --- |
| Yahoo Finance | `STLAM.MI` | `STLAM.MI` | Milan quote, profile, chart | Available |
| Massive | `STLAM.MI` | `STLAM.MI` | Listing market data when the plan supports it | Provider/plan dependent |
| FMP | `STLAM.MI` | `STLAM.MI`, issuer aliases attempted | Structured fundamentals, analysts, calendar | Rate/plan limited during verification |
| EODHD | `STLAM.MI` | `STLAM.MI` | Structured fundamentals and corporate actions | Not returned by the configured plan |
| Finnhub | `STLAM.MI` | `STLA` | Issuer supplementary data and peers | Mapping fixed; verified peer set not returned |
| SEC EDGAR | `STLAM.MI` | CIK `0001605484` / `STLA` | Authoritative IFRS facts | Available |
| ESEF | canonical issuer | No verified package/LEI | Official iXBRL package | Missing with explicit reason |
| Stellantis IR | canonical issuer | Stable official report URLs | Filing/source layer | Available |

The registry contains only primary-source-verified identifiers. It does not use fuzzy symbol guesses as facts.

## Financial history recovered

SEC Company Facts contains IFRS-tagged facts for Stellantis's Form 20-F filings. KAIRO now reads `ifrs-full`, `dei`, `us-gaap` and company-extension namespaces and selects annual duration contexts without mixing interim periods.

| Fiscal year | Revenue | Net income | Standard consolidated FCF |
| --- | ---: | ---: | ---: |
| 2025 | €153.508bn | -€22.368bn | -€12.637bn |
| 2024 | €156.878bn | €5.473bn | -€9.525bn |
| 2023 | €189.544bn | €18.596bn | €7.761bn |
| 2022 | €179.592bn | €16.799bn | €11.344bn |
| 2021 | €149.419bn | €14.200bn | €9.959bn |

Pre-2021 FCA/PSA predecessor figures are not appended as if they were the same reporting entity. Consequently, 5Y views are supported; 10Y issuer-comparable growth is correctly unavailable.

The 2025 balance sheet used in the live check includes €195.153bn total assets, €141.152bn total liabilities, €54.001bn equity, €45.947bn total debt, €30.146bn cash and €2.897bn period-end common shares. Diluted weighted-average shares remain a separate field.

## Formulas and normalization

- `grossProfit = revenue - costOfRevenue` when no non-overlapping reported gross-profit fact exists.
- `EBITDA = operatingIncome + depreciationAndAmortization` when EBITDA is not directly reported.
- `totalDebt = shortTermDebt + longTermDebt`, using non-overlapping concepts.
- `netDebt = totalDebt - cash`; this is consolidated net debt, not industrial net debt.
- `workingCapital = currentAssets - currentLiabilities`.
- `standard consolidated FCF = operatingCashFlow - abs(capex)`.
- `marketCap = current listing price × official period-end common shares`.
- `enterpriseValue = reconciled marketCap + consolidated netDebt`.
- `ROA = netIncome / average total assets`.
- `ROE = netIncome / average equity`.
- `NOPAT = operatingIncome × (1 - effectiveTaxRate)`; the tax rate is bounded to 0–50%, with a documented 25% fallback in loss periods.
- `ROIC = NOPAT / average(debt + equity - cash)`.
- `assetTurnover = revenue / average total assets`.
- `inventoryGrowth = current inventory / prior inventory - 1`.
- `inventoryToRevenue = inventory / revenue`.
- `receivablesGrowth = current receivables / prior receivables - 1`.
- `receivablesToRevenue = receivables / revenue`.

Negative earnings, EBITDA or FCF do not produce misleading P/E, EV/EBITDA or P/FCF multiples. Negative earnings and FCF yields remain valid signed diagnostic values.

## Earnings quality and automotive risk

The verified live calculation produced an earnings-quality score of 46.38/100, `NEGATIVE`, with high confidence. For 2025:

- inventory growth: 6.19%;
- inventory/revenue: 14.43%;
- receivables growth: 26.71%;
- receivables/revenue: 16.50%;
- cash conversion: 20.79%;
- FCF/net income: 56.50%;
- FCF margin: -8.23%.

The engine raises an evidence-backed flag because receivables growth exceeded revenue growth by more than ten percentage points. These fields are shown in the existing Cash Flow / Earnings Quality section without changing its visual system.

`Industrial Free Cash Flow` and `net industrial liquidity` are not substituted with standard consolidated FCF or consolidated net debt. They require a separately normalized official disclosure and remain explicitly distinct.

## Reconciliation and lineage

Each normalized SEC field can retain:

- source namespace and concept;
- filing accession number;
- unit and reporting currency;
- fiscal context and accepted date;
- source URL;
- calculation formula where derived.

Unit scaling, signs, contexts and annual-period selection are covered by automated tests. Balance-sheet identity passes for all five periods. Source priority is official filing/ESEF, official issuer document, structured financial provider, then supplementary provider. Conflicting values are not averaged.

## Data still missing or only partially available

These items are not counted as recovered and are never replaced with demo values:

| Data | Status | Precise reason |
| --- | --- | --- |
| Analyst consensus, estimates, revisions and targets | Missing | Configured FMP/EODHD/Yahoo attempts did not return a usable response for the verified aliases. |
| Verified automotive peer set | Missing | Finnhub returned only the issuer's sibling/current listing; self-listings are filtered and no economically verified external set was returned. |
| Dividend event calendar and payment history | Missing | Corporate-action providers did not return structured events under the configured plans. Historical cash dividends paid are present in the filing cash flow but are not relabeled as ex-date/payment-date events. |
| Quarterly IFRS statements | Missing | The authoritative 20-F Company Facts path provides annual comparable facts; H1/quarter facts are not fabricated from annual totals. |
| ESEF Stellantis package | Missing | No authoritative package URL and LEI were resolved by configured sources. The generic iXBRL parser is ready once a verified package is supplied. |
| Goodwill and separate intangibles | Missing where absent | Current undimensioned Company Facts did not expose a safely non-overlapping value. |
| CEO/CFO tenure, compensation and European manager transactions | Partial/missing | No stable structured, lawful source was returned by configured providers. |
| Guidance credibility | Missing | Historical guidance and outcomes were not available as normalized, time-aware evidence. |
| Industrial FCF / net industrial liquidity | Missing as dedicated fields | Standard consolidated measures are available, but the issuer-specific definitions have not been ingested as separate official facts. |

Management execution, capital allocation and shareholder alignment are now calculated from verified financial history where sufficient. Credibility remains missing instead of being scored from assumptions. Corporate insiders remain separate from US congressional Political Intelligence.

## ESEF readiness

The ESEF adapter now supports iXBRL XHTML parsing for contexts, units, decimals, scaling, signs, `nonFraction` and `nonNumeric` facts, plus IFRS/extension mappings and lineage. Remote filing downloads are restricted to an HTTPS host allowlist, bounded by timeout and size, and do not forward credentials. This is production-ready ingestion infrastructure, but it is deliberately not presented as a Stellantis data source until an authoritative filing package is resolved.

## Validation completed

- TypeScript typecheck.
- ESLint.
- Full Vitest suite, including new issuer-registry, SEC IFRS and ESEF cases.
- Next.js production build with webpack.
- Local production smoke tests for the dashboard, Milan and New York Stellantis analysis/fundamentals routes, and symbol resolution.
- Secret and tracked-environment-file inspection.

The UI, visual hierarchy, navigation and existing authentication behavior were not redesigned by this initiative.
