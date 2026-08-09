# STLAM data lineage

## Identity and scope

| Field family | Scope | Source | Transformation |
| --- | --- | --- | --- |
| Legal name, CIK | Issuer | SEC ticker map/submissions | normalized legal-name and verified registry match |
| ISIN, listings | Issuer/share class | Stellantis investor relations | verified alias registry |
| LEI | Issuer | GLEIF | exact legal-entity record, status `ISSUED` |
| Quote/OHLC/volume | Milan listing | configured market router, Yahoo fallback | no issuer-listing substitution |
| Financial statements | Issuer | SEC Company Facts / 20-F | IFRS taxonomy mapping, comparable-period selection |
| Automotive special metrics | Issuer | latest SEC-hosted official 20-F iXBRL | strict table labels and structural validation |
| Analysts, related companies, dividends, ownership | Issuer or listing as appropriate | provider router / Yahoo server-side fallback | normalized DTOs; no client Yahoo requests |

## Official document record

The filing adapter records issuer ID, document type, period, publication date, source URL, iXBRL format, language, SHA-256 hash and processing timestamp. The current source is the SEC-hosted Stellantis 2025 Form 20-F filed on 2026-02-26. Cache policy is 24 hours fresh and seven days stale.

## Reconciliation rules

1. Financial statements are issuer-level and can be shared across verified listings.
2. Quote, chart, trading currency and technical indicators remain listing-level.
3. Reporting currency is never inferred from trading currency.
4. Market cap uses a single issuer share count and one requested-listing price; sibling listings are never added together.
5. Provider aliases are registry records with confidence and verification timestamp, not scattered ticker conditionals.
6. Official filing values supersede secondary provider values for issuer-defined automotive metrics.
7. A value of zero is accepted only when explicitly reported or mathematically derived; it is never a missing-value placeholder.

## Field states

Completeness V2 uses `AVAILABLE`, `PARTIAL`, `MISSING`, `INSUFFICIENT_EVIDENCE`, `SOURCE_ERROR` and `NOT_APPLICABLE`. The admin lineage page shows source, timestamp, currency, formula/status and exact missing-field names. No raw provider payload or credential is rendered.

## Conflict handling

Reconciled market cap is compared with provider market cap. Material divergence creates a data-quality warning. Industrial free cash flow and industrial net financial position are never substituted for consolidated free cash flow and consolidated net debt. Analyst values in a different currency require a dated FX conversion before aggregation; otherwise they remain excluded.
