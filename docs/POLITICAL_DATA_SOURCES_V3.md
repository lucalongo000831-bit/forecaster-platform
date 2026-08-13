# Political Data Sources V3

## Source matrix

| Source | Role | Authority | Automated access | Current free limitation |
| --- | --- | --- | --- | --- |
| FMP | Recent primary and incremental | Secondary | Server-side, credentialed | Plan/rate restrictions can block congressional endpoints |
| Bargo Congress API | Recent fallback and cross-check | Secondary | Server-side, keyless read | About 3 months; 30 requests/day and 100 rows/request keyless; visible attribution required |
| CapitolExposed | Historical operational backfill | Secondary | Server-side, keyless, paginated | Attribution requested; official verification remains separate |
| U.S. House Clerk | Filing verification, current and prior year | Official | Public yearly indexes/documents only | Document parsing varies; cached batch verification, never page-view scraping |
| Senate eFD | Filing verification when permitted | Official | Only stable public access compatible with terms | Agreement/session/anti-bot controls are never bypassed |

The operational source router uses FMP then Bargo for the overlapping recent window. Historical ingestion uses CapitolExposed because the verified Bargo keyless offering does not expose the required 365-day window. A secondary source is never labeled official.

## Provenance and availability

One `political_transactions` row represents one logical trade. Every contributing representation is persisted in `political_transaction_sources`, keyed by provider and external identifier. `marketAvailableDate` is the disclosure/public-availability date—not the transaction date—so historical analysis cannot look ahead.

Supported provenance states include provider-only, cross-provider match, official House/Senate verification, multi-source verification, pending verification, and conflict. Material conflicts remain stored and visible instead of being silently overwritten.

## Operations

Recent ingestion fetches a 14-day overlapping window to catch late and amended disclosures. It succeeds in degraded mode when either FMP or Bargo refreshes and preserves database/LKG reads if both fail. Historical backfill is resumable through provider watermarks and runs separately from official verification.

## Legal/use note

The data originates from public financial disclosures, but official House/Senate systems and secondary providers may impose attribution, access, and use restrictions. This document is operational guidance, not a legal conclusion. Review applicable terms before commercial redistribution; do not bulk-redistribute raw Bargo records.
