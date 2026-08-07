# Account features

Account state is PostgreSQL-backed and always scoped by `userId`. If the database or authentication secret is absent, private APIs return an explicit `NOT_CONFIGURED` or `UNAUTHENTICATED` response and the UI presents a sign-in/configuration state. No personal mock record is substituted.

## Authentication

Credentials are validated by Zod and passwords are hashed with bcrypt cost 12. A successful login creates a random 256-bit opaque session token. Only its HMAC-SHA-256 digest is stored; the browser receives the token in an HttpOnly, `SameSite=Lax`, path-scoped cookie that is `Secure` in production. Sessions expire after 30 days.

## Watchlists

Users can create, rename and delete lists; add/remove instruments; edit notes; reorder, filter and sort items. Only instrument identifiers and user metadata are stored. Quote, daily change, calculated signal/confidence, target, next persisted event and active-alert count are assembled on read.

## Portfolio ledger

Portfolios accept BUY, SELL, DEPOSIT, WITHDRAWAL, DIVIDEND, FEE and SPLIT records in chronological order. Long and short positions use weighted average cost; closing trades realize P/L and fees are retained at full numeric precision. A deterministic rebuild writes derived positions after every transaction. Values in currencies different from the base currency are not silently converted and cause a visible warning.

Volatility, drawdown, time-weighted and money-weighted performance require a complete cash-flow and FX history. They remain explicitly unavailable rather than being approximated from an incomplete ledger.

## Alerts

Persistent rules support the declared price, change, volume, RSI, MACD, structure, signal, target/stop, event, news, geopolitical and portfolio-risk types and lifecycle states. The server evaluator handles only rules for which verified inputs exist. Unsupported geopolitical sourcing remains `UNAVAILABLE`.

Internal notifications use a channel adapter and a database uniqueness key to prevent duplicates. Future email, push or messaging channels implement the same `NotificationChannel` contract; none is enabled implicitly.
