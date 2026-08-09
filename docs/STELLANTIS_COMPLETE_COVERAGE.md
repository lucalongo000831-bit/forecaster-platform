# Stellantis complete coverage

## Scope

`STLAM.MI` is the reference case for the European equity coverage engine. The system resolves the Milan listing to Stellantis N.V., preserves EUR listing prices, and attaches issuer-level IFRS statements to the same economic issuer as `STLA` and `STLAP.PA`.

The verified identity is CIK `0001605484`, ISIN `NL00150001Q9`, LEI `549300LKT9PW7ZIBDF31`, reporting currency EUR. The LEI was checked against the GLEIF record in status `ISSUED`; listings and ISIN are backed by Stellantis investor relations and SEC filings.

## Verified result

Local production verification on 2026-08-10, model `company-intelligence-v1.4.1`:

| Section | Applicable coverage |
| --- | ---: |
| Identity | 100% |
| Market data | 100% |
| Income statement | 100% |
| Balance sheet | 85.7% |
| Cash flow | 100% |
| Profitability | 100% |
| Capital efficiency | 100% |
| Valuation | 100% |
| Analyst consensus | 100% |
| Peers | 100% |
| Management | 75% |
| Moat | 56.3% |
| Automotive KPI | 100% |
| Dividends | 100% |
| Insiders | 0% |
| Ownership | 100% |
| Risks | 100% |
| Technicals | 100% |
| Seasonality | 100% |
| Forecast | 100% |

Raw field coverage is 87.0%; applicable coverage is 90.1%, up from the original 11% baseline. `NOT_APPLICABLE` is used only for valuation multiples whose current denominator is non-positive. It is excluded from applicable coverage but remains visible in raw coverage.

## Implemented pipeline

- canonical issuer and multi-listing resolution;
- issuer-level provider aliases separated from listing symbols;
- SEC `ifrs-full`, extension and DEI Company Facts normalization;
- official annual-filing iXBRL extraction with document hash and source URL;
- five comparable post-merger annual periods;
- listing-price × issuer-share market-cap reconciliation;
- automotive industrial/consolidated metric separation;
- normalized DCF, reverse DCF and sensitivity table;
- Yahoo server-side supplements for analysts, peers, dividends and ownership;
- evidence-backed moat and automotive risk analysis;
- probabilistic forecast in the listing currency;
- field-by-field completeness V2 and data-lineage views.

## Interpretation

Coverage is a data-availability measure, not an investment rating. A section can be 100% covered while containing negative evidence. For example, current earnings, EBITDA and free cash flow are negative, so trailing P/E, EV/EBITDA, P/FCF and PEG are economically non-meaningful rather than missing substitutes. DCF uses the median of five comparable annual periods and must be read together with the current downcycle, sensitivity table and risk register.

See [STLAM_REMAINING_GAPS.md](./STLAM_REMAINING_GAPS.md) for every unresolved field.
