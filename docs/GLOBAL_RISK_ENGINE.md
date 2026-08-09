# Global Risk Engine

The Global Risk Monitor is a server-only deterministic pipeline. `global-risk-service.ts` requests cached provider data through the existing `FinancialProviderRouter`; React client components never call Massive, FMP, Alpha Vantage or Yahoo directly. The engine refreshes its current result at most every five minutes and stores a historical snapshot no more often than every 15 minutes when the module is consulted. The daily maintenance job also forces a calculation.

The pipeline evaluates volatility, credit, liquidity, rates, market breadth, equity stress, cross-asset transmission, macro and news/geopolitical risk. Every metric is labelled `DIRECT`, `PROXY`, `KAIRO_CALCULATED` or `UNAVAILABLE`. Missing data is excluded from the weighted numerator and denominator, then lowers weighted completeness and confidence; it is never treated as a zero-risk observation.

Provider failures are isolated with `Promise.allSettled`. Existing router fallbacks and stale-while-revalidate caches remain authoritative. If a broad provider outage leaves less than 10% coverage, the service returns the latest stored snapshot with `VERY_LOW` confidence instead of fabricating a new regime.

Public API routes are read-only and cached. Forced recalculation requires an authenticated same-origin request and is limited to two requests per five minutes per user/IP.
