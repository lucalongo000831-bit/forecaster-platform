# News intelligence

`news-intelligence-v1.0.0` processes provider metadata only. It does not scrape,
copy or summarize article bodies. Alpha Vantage is preferred because it exposes
structured ticker relevance and sentiment; Yahoo supplies a headline fallback.

The pipeline:

1. validates and canonicalizes HTTPS source URLs, removing common tracking
   parameters;
2. normalizes titles and deduplicates exact URLs plus highly similar headlines
   published within 48 hours;
3. classifies event type, direct/sector/macro exposure, impact horizon and
   intensity;
4. uses provider ticker sentiment when present, otherwise a small transparent
   lexical model; and
5. produces only aggregate deterministic briefing sentences derived from the
   displayed counts.

The service persists normalized records by canonical URL when PostgreSQL is
configured. Without `DATABASE_URL`, persistence is explicitly reported as
`request cache only`; the UI remains functional. AI enrichment is disabled by
default and the deterministic pipeline never introduces additional facts. A
future structured-output provider must preserve source links, use schema
validation and run only when `ENABLE_AI_NEWS_ANALYSIS` is deliberately enabled.

Sentiment and event direction are heuristic, can be wrong and are not trading
recommendations. Users must open and verify the original publisher source.
