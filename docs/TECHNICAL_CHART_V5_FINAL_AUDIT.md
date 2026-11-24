# Technical V5 independent final audit

Source: `f26c4de14528fef5e03b000294e58cc1914febbc`, PR #31. Audit base is **feat/technical-chart-v5**, never main. Remote main at start: `fd5d7eed4ff4f9b4dfc95c862c52144bf251d7db`; V4 ancestor `af55e6fbc28e5857b86faba6b8e0d9e1bbc7e35a` confirmed. Both are ancestors of the audited source.

## Evidence policy

Implementation evidence is reusable regression context, not an independent oracle. New hand-calculated fixtures, range-contract tests, transport fault injection and measurements are recorded separately. No release approval until full gates and authenticated final Preview acceptance finish. No merge or Production deployment is authorized by this audit.

## Work sequence

1. Challenge session OHLC, native periods, adjustment and incomplete buckets with independent fixtures.
2. Exercise all 96 range/interval combinations with deterministic bounded source histories, including explicit unavailability and coverage reasons.
3. Independently verify MA/Wilder/channel/stop mathematics and prefix invariance; inspect warmup and migration.
4. Challenge cache contraction, fallback identity, malformed responses, cancellation, recovery, chart lifecycle and actual viewport bounds.
5. Targeted browser stress/failure/viewport/multi-pane tests; separate computation benchmarks from network and automation latency.
6. Final complete unit/integration and deterministic E2E gates, lint, types, build, secret scan.
7. Whitelisted commit, audit branch push, Draft PR against V5, one SHA-verified final Preview; authenticated 10-minute acceptance. Preserve main, Production, secrets and numbered duplicate files.

## Confirmed findings and corrections

| Severity | Mechanism reproduced | Narrow correction | Independent regression |
| --- | --- | --- | --- |
| HIGH | Router accepted an upstream response for AAPL while requesting NVDA | Require canonical symbol and exact declared source interval before accepting a provider | `technical-history-audit.test.ts`: wrong-asset response rejects |
| HIGH | Client accepted malformed/non-finite OHLC, duplicate/reversed timestamps, negative volume and wrong-range responses | Validate observed bars and calculation bars before caching/rendering; refuse mismatched selection without retry | `technical-history-client.audit.test.ts`, browser invalid-payload isolation |
| HIGH | Four source hour records were mistaken for four **closed** hours although the fourth hour was still forming | Compare bucket closing time against the effective request end; keep incomplete buckets disclosed rather than inventing prices | Hand fixture at 07:15 UTC excludes the 04:00–08:00 bucket |
| HIGH | Massive crypto Sunday 00:00 UTC became Saturday in ET; Friday quote tail then entered a different native week | Apply UTC to crypto, ET only to Massive equity weeks | Sunday weekly volume 1234 plus Friday quote volume 56 must retain exactly 1234 |
| HIGH | Real implementation MAX profile showed 2,830 ms observed transition / 2,250 ms JavaScript; repeated suffix copies/scans in liquidity/FVG and duplicate active-pane analytics dominated | Remove suffix copies, index first FVG fill by extrema/segment search using the identical floating-point predicate, index displacement prices and reuse active-pane analytics | Eight immutable pre-change full-output hashes through 10K bars; twelve independent brute-force FVG fixtures; V4 point-in-time and mobile multi-chart regressions |
| MEDIUM | Exact-bound cache keys refetched a containing source history after range contraction | Bounded 16-window/60-second per-router containment index over existing Redis/LKG cache; shared pending promise, no cross-asset/interval reuse, stale remains STALE | Fetch-count/expiry/identity/in-flight/stale tests; no provider-series concatenation |
| MEDIUM | Rendering a request's availability/error changed serialized load identity, cancelling it and creating an extra transport | Serialize only range/from/to, not response diagnostics | Browser exact 500/429/disconnect count = 2; invalid/empty count = 1 |
| MEDIUM | Indicator and metadata changes destroyed/recreated the entire chart | Retain chart ownership; replace scoped series/subscriptions; dispose chart on unmount; redraw overlays and scale on revision | Real Lightweight Charts DOM instance identity and visible-domain checks |
| MEDIUM | Every custom selection retained another historical array in workspace state | Bound last-used dataset snapshots to 32, separately preserve verified per-panel fallback | 200 selections remain bounded to 32 without mutating prior snapshots |
| MEDIUM | Native crypto daily/weekly observations still forming could appear COMPLETE | Keep authentic native candle, explicitly mark provisional status and PARTIAL coverage | All 96 range/interval contracts assert the provisional disclosure |
| LOW | Fit All assertions used rounded/clamped indexes, which could conceal partially clipped endpoints | Expose the raw library logical domain and test it after zooming away | 1Y/5Y/10Y/MAX × 1440×900/768×1024/390×844 |

Provider calendar evidence: [Massive crypto aggregates use UTC](https://www.ny5.massive.com/docs/rest/crypto/aggregates/custom-bars); [calendar-week snapping starts Sunday](https://massive.com/blog/aggs-api-updates). No endpoint/cookie/credential has been added to the client.

## Independent methodology and limitations

- `history-v5.audit.test.ts` uses manually calculated OHLCV, US March/November DST, the Thanksgiving 3.5-hour close, missing opening constituents, and Milan's distinct DST weekend. Daily from raw hourly records is tested independently. Weekly is a **native provider aggregate**, not a new hourly-to-weekly algorithm; IPO/holiday/week-tail retention is tested without summing overlapping volumes.
- `technical-chart-matrix.audit.test.ts` executes all **96** combinations on a fixed-clock bounded synthetic source. Final classification: **53 PARTIAL, 43 UNAVAILABLE**, zero incorrect outputs. Twenty otherwise complete cases become truthfully PARTIAL because the native final candle is provisional. This is contract/coverage evidence, not a claim that every paid-provider entitlement is available live. Every nonempty case checks every OHLCV value, exact first/last/count, source interval and requested bounds; unsupported requests do not substitute intervals.
- `studies-v5.audit.test.ts` compares direct SMA windows and **closed-form** exponential weights against the running EMA/SMMA implementation. Wilder TR/DMI/ADX use separately weighted histories; channel max/min uses direct windows. Flat/trending/volatile, zero volume, missing observations, short history and scales 1e-6/1/1e8 are included. Relative numerical tolerance: 1e-9 × max(1, |expected|). Confirmed prefixes are challenged with extreme future mutation. Original 53 moving-average/pre-roll tests and unaffected V3/V4 point-in-time tests are reused, not claimed as newly independent proofs.
- SMA first output requires N genuine observations. EMA/SMMA use an SMA seed; ten periods of pre-roll is a bounded convergence policy, not infinite-history equality. READY describes available prior observations, not official session-calendar completeness. A mathematically seeded EMA can exist while deep-convergence status is LIMITED.
- No source series are merged across providers. Yahoo adjusted-close back-adjustment and Massive split-adjusted OHLC are not asserted to be identical total-return histories. The selected source and price policy remain explicit. Equity complete-session certification remains unavailable and honestly PARTIAL; missing trades are never synthesized.
- Fit All and Reset viewport both fit the loaded horizontal time domain; **Fit visible data** is the distinct vertical autoscale operation. Actual raw logical bounds, not only loaded count, are asserted. Zoom/pan restoration is scoped to the same panel/asset/interval/range.
- The first complete E2E run exposed a mobile MAX oracle precision edge: the library returned logical `from = 9.094947017729282e-13` rather than exact zero. Domain comparisons use **8 × Number.EPSILON × barCount**, less than 1e-10 of one candle for the fixture, not a pixel/bar clipping allowance. No production assertion, timeout or retry was weakened; the actual-domain and stable-instance checks remain required.
- A jsdom chart-lifecycle mock was discarded as an invalid oracle: dynamic-import module identity mixed the actual canvas library with mocks. It was replaced by the stronger real-browser chart instance assertion, without suppressing exceptions or loosening production behavior.
- The real baseline measurement is from the **original f26c4de Preview**, not the final audit Preview. CPU samples identified liquidity matching/sweep searches, FVG suffix scans and chart recreation; it is not legitimate to infer final browser latency from a faster Node fixture. The final Preview must be measured again. Native profiler/devtools time is reported separately from observed automation elapsed time.
- The FVG optimization preserves all creation/availability timestamps and lifecycle semantics. Suffix extrema give the maximum observed fill; an indexed chronological search gives the first full fill. Its predicate uses the original rounded progress expression, not a mathematically similar threshold which could change one-ULP behavior. Eight SHA-256 golden outputs were recorded from untouched `f26c4de` **before** rewriting this function; all fields/events match exactly. No formula, event cutoff, bar limit or future-information policy changed.
- V1/V2/V3/V4→V5 and V5 reload are checked using independent persisted fixtures; legacy inputs remain unchanged. Existing V4 planner/profile/template/alert tests remain in the full suite. Replay is still DEFERRED.

## Independent computation measurement

Apple M2, macOS arm64; dense oscillating daily fixture (not the original smooth-trend fixture); 3 warmups and 25 samples per stage; nearest-rank p95. Each stage is a separate test, not four benchmarks grouped under one test timeout. The original grouped harness hit the normal five-second test limit under concurrent load; it was split **without increasing timeout or dropping samples**. Network, provider normalization and rendering excluded; history preparation here specifically means OHLC validation/deduplication/sort. These are local observations, not universal latency promises. Values below are **mean / p95 / max milliseconds** from the final full unit run, concurrent with the targeted browser checks.

| Bars | History preparation | Studies | Structure | Combined |
| --- | --- | --- | --- | --- |
| 1,000 | 0.76 / 1.01 / 1.22 | 0.52 / 0.91 / 1.45 | 5.10 / 6.08 / 6.27 | 5.32 / 5.59 / 5.96 |
| 2,500 | 2.00 / 2.18 / 2.37 | 0.92 / 1.13 / 1.67 | 11.26 / 12.88 / 13.04 | 14.62 / 19.00 / 20.10 |
| 5,000 | 4.35 / 4.64 / 4.68 | 2.05 / 2.56 / 2.61 | 28.65 / 37.31 / 40.92 | 45.10 / 68.21 / 68.41 |
| 10,000 | 10.17 / 14.88 / 15.39 | 4.58 / 7.34 / 7.48 | 64.46 / 79.75 / 88.67 | 97.28 / 160.60 / 179.97 |

## Local gate evidence

- Full unit/integration after the MAX performance correction: **972/972**, 143 test files, zero failures.
- Full lint and TypeScript: PASS.
- Production Next.js build: PASS, no real provider credentials copied into the build snapshot.
- Secret scan: zero tracked/pending sensitive files, zero known-secret/credential hits in source or built artifacts. Numbered duplicate files excluded and intact.
- New targeted real-browser audit: **12/12** (includes dependency warmup), zero retries. Prior targeted run exposed the diagnostic-load-identity defect and ambiguous duplicate-indicator test locator; both causes resolved without weakening assertions.
- Final targeted mobile + multi-chart checks after the performance correction: **13/13**, including warmup, all four historical domains, controlled provider failures and the V2 four-pane maximize/restore flow. Earlier complete E2E: 207/208, the sole failure was the documented floating-point oracle edge. A subsequent run was intentionally interrupted at 198 passes when the independent real performance profile identified additional corrective work; it is not counted as a complete PASS.
- Final complete deterministic E2E: **208/208**, zero unexpected/skipped/flaky tests, retries disabled, external financial-provider attempts **0** (network guard asserted throughout). Final Preview SHA, authenticated live acceptance, live browser performance and memory observations remain **pending** at the time of this source report. See final PR/acceptance report for actual results, not an assumed PASS.

## Status

Local correctness corrections verified. **Not yet final release approval.** No merge or Production deployment. Final approval requires the complete E2E gate and fresh authenticated Preview acceptance; partial provider coverage and deferred Replay are disclosed limitations, not fabricated successes.
