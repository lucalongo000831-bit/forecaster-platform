# Ask Kairo AI architecture

Ask Kairo is a server-side market-intelligence agent. The browser calls only Kairo's same-origin APIs; it never imports the OpenAI SDK or contacts OpenAI or a financial provider directly.

## Request path

1. The client derives the selected symbol, market, asset class and page from the App Router path.
2. `POST /api/ai/chat` validates the bounded request with Zod, requires an authenticated user and applies a per-user/IP rate limit.
3. A bounded PostgreSQL conversation history and the versioned analyst prompt are sent to the OpenAI Responses API with `store: false`.
4. Function calls execute only through `src/ai/tools/registry.ts`, which delegates to the existing provider router, deterministic engines, Company Intelligence services and the user's owned watchlists.
5. Tool outputs are normalized, array-limited and source-labelled before they enter the model context.
6. Operational status, response text, sources and non-sensitive metadata stream to the drawer as newline-delimited JSON.

The OpenAI response identifier may be saved as non-sensitive message metadata. API keys, cookies, provider headers, full upstream payloads, system prompts and private reasoning are not stored.

## Controls

- Maximum message: 4,000 characters.
- Conversation context: 12 messages.
- Tool calls: 8 per turn.
- Output: 2,400 tokens.
- Request timeout: 55 seconds.
- Rate limit: 10 requests/minute per authenticated user and IP, distributed through Redis when configured.
- OpenAI retries: one controlled SDK retry.
- OpenAI response storage: disabled.
- Cancellation: browser abort propagates to the server and SDK request.

Provider and calculation caches remain authoritative. Company Intelligence uses its aggregate cached report; quote, chart, news, fundamentals and calendars keep their existing provider-specific freshness policies.

## Provenance and truth labels

Sources carry provider, timestamp, asset, currency, link where available, and one of `FACT`, `CALCULATED`, `ESTIMATE`, `MODEL_OUTPUT`, `ANALYST_CONSENSUS` or `SCENARIO`. News links use their canonical original URL. Missing political transactions, peers, statements or other unsupported data are returned as unavailable and must not be synthesized.

The formulas used by Kairo's deterministic tools are documented in `docs/QUANT_MODELS.md`, `docs/FORECAST_ENGINE.md`, `docs/BACKTEST_ENGINE.md` and `docs/COMPANY_ANALYSIS_METHODOLOGY.md`. OpenAI summarizes those outputs; it does not replace their calculations.

## Company and crypto separation

Company analysis is consolidated by `get_company_intelligence` and can expand into statement, analyst, valuation, DCF, risk, catalyst, news and technical tools. Crypto analysis is consolidated by `get_crypto_intelligence`; corporate revenue, EPS, EBITDA, balance-sheet quality, ROIC and corporate DCF are explicitly not applicable.

## Persistent data

- `ai_conversations`: user ownership, title and current instrument context.
- `ai_messages`: user/assistant text, sources and safe metadata.
- `ai_tool_calls`: tool name, status, duration and provider names only.

Apply `drizzle/0004_motionless_justice.sql` before enabling Ask Kairo in a new environment.
