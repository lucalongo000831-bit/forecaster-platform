# Technical Chart V5 implementation ledger

Base: `af55e6fbc28e5857b86faba6b8e0d9e1bbc7e35a`, branch `feat/technical-chart-v5`.
Required production ancestor: `fd5d7eed4ff4f9b4dfc95c862c52144bf251d7db`.
V4 PR #30 remains unmerged. Environment files and untracked numbered copies are excluded.

## Diagnosis before changes

- V4 Preview: changing NVDA MAX / 1D to 4h silently changes range to 1M; 63 bars are labelled AVAILABLE. Source aggregation uses UTC 4-hour buckets and requires exactly four hourly bars, discarding session-edge buckets. Production V3 uses the same implementation (96 4h bars observed on its independently cached feed). Neither observed page crashed during this particular live attempt; a repeatable aggregation defect is established by the implementation and session fixtures, not a claim of a reproduced runtime exception.
- Hourly range support is artificially limited in both service and client. Provider range/interval compatibility is duplicated. HTTP success is labelled AVAILABLE without a completeness check. Massive history ignores `next_url`, and its 50,000 limit applies to base aggregates, not a guarantee of complete requested history.
- Indicator calculations consume `dataset.bars` after selected-range slicing. EMA seeds at the 200th visible bar despite earlier history being available. No separate calculation-history contract exists.
- Installed Next.js 16.3 error boundary supplies `retry` to refetch server content; terminal error.tsx uses `reset`, which only clears the same failed render state. The previous live incident remains unproven until controlled RSC failure/recovery tests pass.

Production requires a separately reviewed minimal session-aggregation/recovery hotfix; V5 does not authorize a Production release. No Production mutation is part of this task.

## Execution order

1. Session-aware aggregation, interval/range coverage, pagination and atomic requests; targeted tests.
2. Separate calculation history and visible history; independent warmup fixtures.
3. SMA / SMMA / EMA configuration and persistence.
4. Additional deterministic studies and chart controls; replay only if prefix-safe.
5. Next.js retry recovery and controlled failure tests.
6. Stable code gates, one Draft PR and final Preview; authenticated acceptance.

## Coverage policy

No daily-to-intraday synthesis. Unsupported intervals retain the previous verified dataset with its original labels. Missing observations are never replaced by zero. Session holidays are represented by absent sessions, not generated bars. Intraday missing segments are detected within observed sessions; absence of an entire session cannot be certified without an exchange calendar, and diagnostics disclose that limit. Exchange sessions use local clocks with DST conversion. US early-close dates and unsupported exchanges require explicit conservative coverage status rather than fabricated data.

Primary sources: [Massive aggregate limit semantics](https://www.massive.com/blog/aggs-api-updates), installed Next.js 16.3 error-boundary documentation, installed Lightweight Charts 5.2 types.

Live acceptance found missing opening-session observations in STLAM.MI hourly data despite a successful provider response. Equity coverage is therefore conservatively PARTIAL until a complete official session/holiday calendar can certify the entire requested window; the diagnostic explains this explicitly. Crypto is continuous: gaps crossing UTC midnight are checked and its boundary tolerance follows the actual interval, never the equity weekend tolerance. This acceptance correction does not change OHLC or indicator formulas.

A strict live MAX audit also detected one NVDA observation (2015-07-16) whose adjusted close exceeded its adjusted high by approximately 1e-16. The source bar was valid: separately rounding `high × (adjustedClose / close)` and the supplied adjusted close introduced a one-ULP envelope violation. After the unchanged adjustment ratio, high/low now include the adjusted open/close via max/min. Two fixtures cover upward and downward rounding; no observation, price source, indicator formula or volume is invented or replaced.

Final native-period checks found a Yahoo weekly aggregate followed by an overlapping Friday daily quote (same closing price, volume already included in the weekly aggregate). Native daily/weekly normalization keeps the first aggregate in each provider calendar period and excludes overlapping quote tails without summing their volumes. Weekly anchors are fixed calendar rules, not inferred from the first returned observation: Yahoo Monday in the instrument calendar; Massive Sunday in ET ([aggregate boundary specification](https://massive.com/blog/aggs-api-updates), [ET aggregate semantics](https://massive.com/docs/rest/stocks/overview)). IPO/holiday-short first weeks and changes to requested history cannot shift later periods. NVDA 1Y now contains 52 genuine weekly bars, not 53 overlapping observations.

All intraday intervals now pass through the same regular-session/24-hour validator. A fractional calculation pre-roll was also found to phase-shift Massive multiplied-minute aggregates; bounded fetches begin at a UTC day boundary and the service still filters exact requested bounds. Regression fixtures cover 5/15/30-minute alignment. Only the technical-history cache namespace changes (`v5-aligned`), avoiding reuse of previously misaligned source history without a global purge. Continuous crypto fallback uses interval-sized boundary tolerance rather than the equity closure allowance; an overnight-truncated candidate no longer prevents trying another provider.

## Calculations

- SMA(N): rolling sum of N selected-source prices divided by N. First value is at index N−1; no shorter synthetic seed.
- EMA(N): SMA(N) seed, then previous EMA + 2/(N+1) × (price − previous EMA).
- SMMA / SSMA(N): SMA(N) seed, then (previous SMMA × (N−1) + price)/N. It is distinct from SMA. Source may be close/open/high/low/HL2/HLC3/OHLC4.
- Pre-roll requests up to 10N earlier observations, bounded by actual interval retention and available instrument history. This is a convergence policy, not an assertion that 10N bars always exist. LIMITED status is visible when unavailable. A genuine seed can exist even when the desired convergence horizon does not.
- Supertrend: Wilder ATR(N); basic bands HL2 ± multiplier×ATR. Final upper/lower bands ratchet unless the prior close breaks the prior band. Direction changes only on a current close crossing the active band. Separate bullish/bearish plots contain whitespace at transitions.
- DMI: directional up/down movement keeps only the larger positive move. True range and DM use Wilder sum smoothing. DI = 100×smoothed DM / smoothed TR; DX = 100×abs(+DI−−DI)/(+DI+−DI); ADX seeds from N valid DX observations, then uses Wilder smoothing. Flat TR/DM gives 0, unavailable warmup remains null.
- Donchian: highest high, lowest low and midpoint of the latest N observed bars, including the current bar. Monotonic queues implement the rolling extrema in O(n).
- ATR stop LONG/SHORT: ratcheting close ∓ multiplier×Wilder ATR; AUTO uses Supertrend's confirmed direction. These are descriptive levels, without execution.
- Price-scale modes transform the rendered scale only; OHLC values are unchanged.

Sources for local session clocks and US early closes: [NYSE calendar](https://www.nyse.com/markets/hours-calendars), [official 2026–2028 announcement](https://ir.theice.com/press/news-details/2025/NYSE-Group-Announces-2026-2027-and-2028-Holiday-and-Early-Closings-Calendar/). July 2, 2026 is deliberately a full US equity session; bond-market early-close schedules are not substituted. Historical or exceptional closures outside the verified calendar scope remain an explicit completeness limitation when detected.

## Replay decision

DEFERRED: a trustworthy historical replay must synchronize primary bars, indicator pre-roll, benchmark history, MTF confirmation times, drawings and every V4 event's availableAt. The current workspace loads these independently. Shipping a candle-only playback would risk future-event leakage. No partial replay control is exposed.

## Recovery

Next.js 16.3 `reset()` clears an error while reusing failed server content. `retry()` runs router refresh in a transition and resets the boundary. The terminal now uses `retry`, without forced browser reload, auth invalidation or a refresh loop. E2E injects a failing Dashboard RSC response and proves Retry causes a new healthy RSC request. A separate aborted RSC transport test verifies recovery and bounded requests.

## Persistence

V5 uses a new envelope at `kairo:technical:v5:<symbol>` containing the validated V4 workspace and V5 preferences. V1–V4 entries are read for migration and preserved intact. Indicator configurations include source, color, line width, period, visibility, multiplier, mode and order. Multiple instances retain independent IDs. Indicator presets are local and sanitized on restore.

## Verification environment and measurements

The Desktop checkout is managed by macOS File Provider. A concurrent development server and default-worker full suite encountered system load above 90 and timeout-only failures in unchanged Seasonality tests. No timeout, Seasonality formula or assertion was weakened. Final verification uses a source-identical snapshot outside the cloud-managed Desktop, with one Vitest worker and a production-mode Next server. Environment files, credentials, Git metadata and numbered duplicate files are not copied. Application files are compared byte-for-byte before final verification (the generated `next-env.d.ts` is restored to its original production import).

- Full unit/integration suite after the final corrections: 776/776, 134 test files. Final native-period/session/provider regression gate: 61/61; numeric OHLC/legacy/studies gate: 70/70.
- Final-source full deterministic E2E: 175/175, zero skipped/flaky/unexpected, desktop/tablet/mobile, production-mode server, 4.6 minutes. Interrupted runs are not counted as passes. Provider-audit assertions verify isolation in every project; the live local audit endpoint also reported zero blocked attempts and an empty outbound-host map.
- ESLint, independent TypeScript check and Next.js production build: PASS.
- Source and production client-bundle credential checks: zero matches; environment files remain ignored.
- Dedicated performance fixture: 10 samples per size, three moving averages plus V5 studies and structure. This is a local calculation benchmark, not a browser FPS or provider-latency claim.

| Bars | Mean ms | p95 ms | Max ms |
| --- | ---: | ---: | ---: |
| 1,000 | 4.21 | 5.38 | 5.38 |
| 2,500 | 7.82 | 8.99 | 8.99 |
| 5,000 | 15.80 | 16.49 | 16.49 |
| 10,000 | 35.19 | 37.08 | 37.08 |

The Volume Profile date selectors previously recreated and locale-formatted every option during parent renders. A shared memoized option list and one reusable Intl formatter now retain every selectable timestamp without repeated formatting for unchanged bars. The real local MAX check retains 6,977 options in each selector. Browser-integrated CDP runs are not comparable enough to certify a latency improvement: aggregate script/task counters also include automation/annotation work, with observed command timeouts. No FPS or measured browser-speed improvement is claimed from these counters; independent UI profiling remains part of the final-audit acceptance evidence.

Deterministic browser tests and live Preview acceptance are separate gates. A fixture session marker is not proof of a real authenticated Preview session. No live acceptance result is inferred from local fixtures.

The first full browser run exposed a test-only responsive locator defect: the tablet sidebar hides its text label, so the new recovery test never reached the Dashboard fault injection. Tests now open the mobile menu when required and select the actual Dashboard navigation link by its href; this preserves the menu's normal close handler. Both RSC recovery scenarios pass on desktop/tablet/mobile (7/7 including setup), without changing application behavior, raising timeouts or weakening recovery assertions. The subsequent full run passed all 175 tests.

## Live acceptance evidence

Draft PR: #31, stacked on the audited V4 branch. The initial V5 Preview was READY. Authenticated live checks confirmed NVDA 1h/3M (455 bars), 4h/3M (130), 4h/6M (254), 1D/5Y (1,255 visible, 2,081 pre-roll bars for 200-period studies) and MAX (6,977 bars back to 1999-01-22; pre-listing warmup honestly LIMITED). AAPL, MSFT, SPY, QQQ and STLAM.MI hourly/four-hour views were inspected. BTC-USD and ETH-USD 1h/4h use genuine intraday data, explicit provider provenance and non-realtime labels where applicable.

The initial live acceptance exposed the equity/crypto coverage correction documented above; the corrected Preview must be checked before treating acceptance as complete. A controlled failure of one non-Document Dashboard Fetch on the real Preview recovered through normal navigation: two Dashboard requests, zero logout requests, session retained. Interception was removed immediately. This is distinct from the deterministic error-boundary Retry test; no claim is made that the live prefetch failure itself displayed the boundary.

Machine-readable final unit/E2E reports are generated in ignored `test-results/technical-v5-unit.json` and `test-results/technical-v5-e2e.json`. Live session duration and corrected-deployment acceptance are reported separately; disconnection time is not counted as active observation.

On 2026-10-17 an authenticated session was actively observed from 10:57:21Z, with a fresh server-side Settings check at 11:08:34Z (672 seconds), and continued navigation afterwards. Private watchlists loaded without mutation. Both Multi-Chart panes rendered; the local-only planner fixture produced quantity 20 and 2R, then its test entry/stop/target were cleared. Visual indicator/scale changes made zero new history requests. Desktop/tablet/mobile screenshots are saved as ignored test artifacts.

The SVG-only recovery setup exposed browser annotation-tool errors (`animation` on an undefined style object). They reproduce on the standalone icon document with zero Kairo application scripts loaded; the source is an anonymous injected browser-comment/React bundle. These are recorded separately from application errors, not silently counted as a healthy Kairo exception. The actual Settings and chart tabs have no critical application exceptions.
