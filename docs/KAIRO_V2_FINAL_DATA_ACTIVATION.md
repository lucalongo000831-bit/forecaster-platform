# Kairo Data V2 — final activation

This branch closes the observable data-path gaps without changing the visual identity. Calendar, congressional disclosures, macro, energy, positioning, news and global-risk snapshots remain server-side and persisted before UI consumption.

## Runtime path

`provider -> raw_provider_records -> normalized domain tables -> quality gate -> data_snapshots / last_known_good -> server service -> route or Server Component -> Client Component props`

`DataPathTracer` reports raw, normalized, database, snapshot, API-consumable and UI-consumable record counts. It never returns credentials or authenticated source URLs.

## Publication rules

- A failed or suspiciously empty refresh does not replace the last-known-good snapshot.
- Missing data reduces coverage and is not converted to zero.
- Calculations are labelled `CALCULATED_FROM_DIRECT`; proxy observations remain `PROXY`.
- Kairo AI remains disabled and is not part of this activation.
