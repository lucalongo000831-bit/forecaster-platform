# API architecture

## Contract

Success responses use `{ data, meta }`. `meta` includes request ID, provider, source/fetched timestamps, freshness, quality, delayed/fallback flags and warnings.

Errors use:

```json
{
  "error": {
    "code": "PROVIDER_UNAVAILABLE",
    "message": "Dati temporaneamente non disponibili",
    "requestId": "...",
    "retryable": true
  }
}
```

All query/body values are parsed with Zod. Route handlers enforce body size, authentication/ownership where applicable, per-IP/per-user limits and Node runtime for provider access. Production responses never expose stack traces.

## Route families

- Market: search, resolve, quote(s), chart, profile, fundamentals/statements, analyst, targets, news, events and status.
- Analysis: technical, fundamental, seasonality, signal, forecast, targets, risk plan, calendar and political availability.
- User: watchlists/items, portfolios/transactions and alerts.
- Backtest: run, status/result and trades.
- Operations: public minimal health plus protected provider/database detail.

## Cache policy

Route metadata sets CDN caching only for public non-user data. User data is private/no-store. Quotes use seconds, charts minutes, profiles/fundamentals hours, and deterministic analysis keys include input timestamps plus model/schema versions.

## Abuse controls

Symbols and search terms have allowlisted character sets and strict length limits. Multi-symbol endpoints cap cardinality. Backtest/AI endpoints require authentication and tighter quotas. `Retry-After` is emitted with HTTP 429.
