# KAIRO Political Intelligence V2

Political reads are PostgreSQL-first. The existing FMP feed is normalized, deduplicated, mapped to canonical instruments, persisted and then served. Disclosures use `disclosureDate` as the market-available date for analytics; value ranges remain ranges and midpoint estimates are labelled.

The US House Clerk bulk document URL builder supports official annual files. Deterministic document extraction and record verification remain a separate ingestion stage; no HTML scraping or anti-bot bypass is used. The Senate currently has no stable public API suitable for automation, so official Senate automation is `UNSUPPORTED` and FMP records remain `PROVIDER_ONLY` unless independently verified.

If a refresh returns empty after a non-empty sync, the write is rejected as `SUSPICIOUS_EMPTY`; previous counts and transactions remain intact. A true zero needs a successful authoritative query with an explicitly bounded scope.
