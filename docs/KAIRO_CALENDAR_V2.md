# KAIRO Calendar V2

The Calendar service reads `calendar_events` and `economic_release_events` before contacting an upstream provider. Earnings and dividends retain the existing provider router. Macro release dates are ingested independently from official sources, initially FRED, with adapters for BLS, BEA, EIA, Treasury, ECB and Eurostat.

Every category carries status, source, nullable count, update time and LKG flag. `0` is displayed only when a source has authoritatively returned a valid empty range; otherwise the UI displays `—` and an unavailable reason. Dates are stored in UTC and retain source precision metadata. Provider failure preserves persisted/LKG events.

Known limitation: some official release calendars publish a date without an exact time. Such records are labelled with `DATE_WITH_DEFAULT_TIME`; KAIRO does not present that default as a source-confirmed exact time.
