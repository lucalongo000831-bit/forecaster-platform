# Future Kairo AI

Kairo AI is preserved in the repository but disabled by default. The financial workspace, provider routes, calculations and account features do not require an OpenAI credential.

## Existing implementation

- server-only OpenAI client in `src/ai/client.ts`;
- market, company and crypto agents in `src/ai/`;
- versioned system prompt, tool registry and conversation memory;
- `/api/ai/chat` streaming route and conversation routes;
- Ask Kairo drawer and contextual launch buttons;
- database-backed conversations when PostgreSQL is configured;
- unit tests for AI intent policy.

## Current operating mode

Set `ENABLE_KAIRO_AI=false` or leave it unset. The drawer displays a parked-state message, conversation requests are not sent, and every AI route rejects before creating an OpenAI client. `OPENAI_API_KEY` is optional and is never read while the feature is disabled.

## Future reactivation

1. Configure `OPENAI_API_KEY` and `OPENAI_MODEL` only in the server environment.
2. Configure PostgreSQL and authentication if persistent private conversations are required.
3. Verify quota, model access, rate limits and the AI acceptance tests.
4. Set `ENABLE_KAIRO_AI=true` in the intended environment.
5. Deploy and confirm sourced tool output, streaming, cancellation and conversation ownership work before enabling the feature for users.

Never prefix an OpenAI credential with `NEXT_PUBLIC_`, return it from an API route, or log it.
