# Political V2 asset mapping and coverage

Congressional records are normalized from FMP into canonical politician, filing and transaction rows. A disclosure ticker is resolved against a market profile and instrument record. Options and non-market assets are never forced into an equity issuer. ETF and crypto-related listings remain distinct instruments: a Bitcoin ETF disclosure is not a direct BTC disclosure.

The API/UI result status is one of `VERIFIED_ACTIVITY`, `VERIFIED_ZERO`, `PARTIAL_DATA`, `DATASET_INITIALIZING`, `LAST_KNOWN_GOOD` or `UNSUPPORTED`. `VERIFIED_ZERO` requires a healthy persisted source, at least 95% requested history coverage and at least 98% issuer mapping. Otherwise an empty symbol result is `PARTIAL_DATA`, with window and mapping evidence.

FMP plan/rate limits may prevent the targeted one-to-five-year backfill. That limitation is exposed; recent data is never relabelled as complete history.

Trace with `NODE_OPTIONS=--conditions=react-server node --env-file-if-exists=.env.local --import tsx scripts/trace-political-data.ts NVDA`.

Direct text aliases are deliberately narrow: `Bitcoin/BTC` resolves to `BTC-USD` and `Ethereum/Ether/ETH` to `ETH-USD` only when the raw disclosure does not identify an ETF, fund, trust, note or share. A named Bitcoin ETF such as IBIT remains the ETF and is never reclassified as direct crypto.
