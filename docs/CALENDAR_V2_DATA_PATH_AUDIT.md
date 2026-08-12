# Calendar V2 data-path audit

The calendar combines provider earnings/dividend events with persisted FRED release dates. The previous persistence reader exposed the entire wrapper payload as `details`, while the writer stored event-specific details under `payload.details`; refresh conflicts also reset valid intraday times to midnight. Both defects could make available macro records look incomplete in the UI.

The repaired canonical event model distinguishes `EARNINGS`, `DIVIDEND`, `MACRO` and `CENTRAL_BANK`. Category availability and counts are month-specific. A category may contain a verified zero only when its upstream dataset succeeded; otherwise the count is null with an explicit source-unavailable reason.

Earnings show EPS, revenue and session. Dividends show amount, currency, ex/declaration/record/payment dates, frequency and yield—never EPS. Macro and central-bank events show actual, forecast, previous, unit and pending/released state.

Trace with `NODE_OPTIONS=--conditions=react-server node --env-file-if-exists=.env.local --import tsx scripts/trace-calendar-data.ts 2026-08-01 2026-08-31`.
