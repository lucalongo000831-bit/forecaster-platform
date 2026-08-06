# Market calendar

The calendar loads three independent FMP stable feeds through server-only
adapters: `earnings-calendar`, `dividends-calendar` and `economic-calendar`.
The endpoint names and update cycles were verified against FMP's official stable
documentation. Each category has its own availability state and cache policy;
an entitlement or upstream failure in one feed does not hide the others.

`GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD` accepts at most 93 days,
applies an IP rate limit and returns a CDN stale-while-revalidate policy. Events
are normalized and deduplicated, carry provider provenance and are persisted by
provider/event ID when PostgreSQL is configured. Without `DATABASE_URL`, the UI
clearly reports `request cache only`.

No demo event is mixed with sourced data. Estimates and actual values remain
nullable. Provider timing, revisions and announcement dates can change, so the
calendar must not be treated as an execution clock.

Official sources:

- https://site.financialmodelingprep.com/developer/docs/stable
- https://site.financialmodelingprep.com/developer/docs/stable/economics-calendar
- https://site.financialmodelingprep.com/developer/docs/cycle-times-stable
