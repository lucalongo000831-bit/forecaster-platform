# Security model

## Trust boundaries

Browser input, provider payloads, news text and webhook/cron requests are untrusted. Secrets, database access, provider adapters and quantitative engines are server-only. Authorization is enforced in services/repositories, not the client.

## Controls

- Zod validation and length/cardinality limits on every public route.
- canonical instrument resolver prevents ticker/path injection and provider symbol confusion.
- same-origin/CSRF checks for cookie-authenticated mutations.
- secure, HttpOnly, SameSite cookies in production and ownership checks on all private rows.
- CSP, frame denial, content-type, referrer, permissions and transport headers.
- provider base URLs are allowlisted constants; user input never controls hosts, preventing SSRF.
- structured logging redacts authorization, cookies, secrets, URLs with secret query parameters and raw provider bodies.
- rate limits cover IP, user, route and costly-operation dimensions.
- database queries are parameterized through the ORM; output is React-escaped and external URLs validated.

## Secret management

`.env.local` is ignored and permission `600`; `.env.example` contains names only. No provider key has a `NEXT_PUBLIC_` prefix. Vercel Production/Preview variables are sensitive; Development variables are encrypted by Vercel but cannot use its Sensitive type. Secret values are never returned by health endpoints.

## AI/news isolation

Article text is data, never instruction. HTML is stripped, length bounded and delimited. Structured output is validated. The model cannot select sources or calculate financial numbers. Source links and original timestamps remain independent.

## Residual risks

Yahoo is unofficial; provider terms/entitlements may change. In-memory development fallbacks do not provide distributed guarantees. External database/Redis security depends on user-owned configuration and network controls.
