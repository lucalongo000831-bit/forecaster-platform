# STLAM remaining gaps

Verified after the final local gap-repair loop on 2026-08-10. Eleven applicable fields remain unresolved; placeholders are not used.

| Field | Reason | Attempted sources | Official-source attempt | Dependency / future source |
| --- | --- | --- | --- | --- |
| `Balance Sheet.goodwill` | latest SEC Company Facts does not expose a current standalone goodwill fact | SEC IFRS facts, provider fundamentals | 20-F reports a combined goodwill/indefinite-intangibles line; it is not mislabeled as goodwill | standalone official note fact or validated ESEF package |
| `Balance Sheet.intangibles` | latest structured facts do not provide a reconciled standalone total compatible with the model | SEC IFRS facts, provider fundamentals | official combined and other-intangible rows inspected | validated note-table normalizer with non-overlap proof |
| `Management.credibilityScore` | guidance accuracy and promise-versus-delivery history are not structured | filings, news/provider bundle | no auditable multi-period guidance dataset found | transcripts/guidance history with dated outcomes |
| `Moat.intellectual property` | no comparable quantitative IP advantage series | official filing, fundamentals | narrative alone is insufficient | patent/licensing economics or verified R&D outcomes |
| `Moat.software ecosystem` | no structured monetization/engagement series | official filing | narrative evidence is insufficient | software revenue, attach rate or active-user disclosure |
| `Moat.battery/EV strategy` | no comparable battery/EV unit-economics series | official filing | strategy narrative is not scored as an advantage | EV mix, battery cost, contribution margin history |
| `Moat.supply chain` | supplier resilience/terms not quantified | official filing | no auditable advantage metric | supplier concentration, savings and disruption history |
| `Moat.regulation` | compliance burden is a risk, not automatically a moat | official filing | no defensible barrier-to-entry measure | verified regulatory cost/approval advantage |
| `Moat.switching costs` | automotive customers can switch brands | official filing | no retention/contractual lock-in evidence | repeat-purchase/retention or ecosystem lock-in series |
| `Moat.technology leadership` | no comparable technology outcome series | official filing | patent counts or marketing claims were not substituted | independent technology benchmarks and monetization |
| `Insiders.transactions` | foreign private issuers are generally not covered like US Form 4 issuers and configured feeds returned no verified transactions | Finnhub, SEC Form 4, Yahoo | no valid issuer transaction record returned | Dutch/European management-transaction registry adapter |

## Provider-specific limits

- FMP returned rate/plan failures during verification; it was not replaced with demo data.
- EODHD did not return the requested Stellantis fundamentals under the configured access.
- Finnhub returned the issuer alias but no valid economic peer set; Yahoo related-company data supplied the verified fallback group.
- SEC and the SEC-hosted official 20-F supplied the core IFRS and automotive facts.
- A validated ESEF filing package is not yet attached to this issuer; the generic ESEF parser remains available but is not presented as a source that was not used.

The resulting applicable completeness is 90.1%, not 100%. This file is the authoritative explanation of the residual gap.
