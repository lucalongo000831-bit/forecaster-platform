# Global Market Brief

The editorial brief is deliberately separate from the automatic Kairo score. Its source label is always **CHATGPT SCHEDULED ANALYSIS — MANUALLY PUBLISHED**.

Workflow:

1. Sign in and open `/preferences/global-market-brief`.
2. Copy the provided template into the scheduled ChatGPT task if desired.
3. Paste the plain-text report (maximum 100 KB).
4. Parse it with the local deterministic TypeScript parser.
5. Edit every structured field.
6. Preview the public presentation.
7. Publish a new immutable version.

The parser recognizes case-insensitive headings with spaces, underscores or hyphens and colon/hyphen separators. Missing sections become `Not provided.`; no content is inferred. React renders all content as text, never as arbitrary HTML. Publishing, draft creation and archiving require an authenticated same-origin request and are rate limited.

Published versions retain the raw report, structured data, report date, publication time and publishing user. Editing an old publication is implemented as duplication into a new version. A disagreement between the quantitative status and editorial status produces a divergence warning; neither result overrides the other.
