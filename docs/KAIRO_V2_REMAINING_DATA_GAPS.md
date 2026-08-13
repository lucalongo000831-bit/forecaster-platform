# Kairo Data V2 remaining gaps

- FMP congressional history is fetched with controlled pagination up to 500 records per chamber. The one-year target and optional five-year extension still depend on the configured subscription and may stop early on rate-limit/payment responses; partial live pages are retained and labelled partial.
- Official congressional source verification is not yet complete for provider-only records; they remain `PROVIDER_ONLY`/`PENDING`.
- Sector-ETF breadth is a transparent proxy, not constituent-level market breadth. It is withheld when fewer than 80% of the declared ETF universe is available.
- Bid/ask liquidity is direct only when the active market provider supplies both sides. Other liquidity metrics remain explicit proxies.
- EIA ingestion requires `EIA_API_KEY`; missing configuration yields a missing layer and preserves LKG rather than demo data.
- FRED release dates often provide date precision only; the stored default time is labelled as such.
