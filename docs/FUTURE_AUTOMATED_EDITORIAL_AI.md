# Future automated editorial AI

OpenAI remains parked: `ENABLE_KAIRO_AI=false` and the Global Markets module neither imports the OpenAI client nor requires `OPENAI_API_KEY`.

The current `EditorialBriefProvider` interface is implemented by `ManualEditorialBriefProvider`. A future `KairoAIEditorialBriefProvider` may implement the same methods and return the same `GlobalMarketBrief` DTO, allowing the public page and version history to remain unchanged. Such an implementation must be opt-in, preserve provenance, keep human approval before publication, and never relabel model-generated commentary as automatic quantitative data.

No current code reads ChatGPT accounts, cookies or conversations. There is no scraping or browser automation in this workflow.
