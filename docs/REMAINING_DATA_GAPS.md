# Remaining data gaps

These gaps are intentionally visible and must not be replaced by demo or inferred facts.

| Gap | Reason | Current UI behavior | Future source |
|---|---|---|---|
| Verified on-chain flows, wallet concentration and exchange reserves | Not in configured provider contracts | Not available | dedicated on-chain provider |
| Full UCITS ETF holdings across all European venues | Finnhub plan/listing coverage varies | provider plan limit or not reported | licensed ETF dataset |
| Official normalized ESEF coverage for every European issuer | taxonomy and filing-entrypoint ingestion is jurisdiction dependent | official European layer marked unavailable when unresolved | ESMA/national OAM ingestion |
| Complete analyst history and revisions | provider plan dependent | plan limit/not reported | licensed estimates feed |
| Global insider transactions outside supported disclosure regimes | filings differ by jurisdiction | not applicable/not reported | local official registers |
| LEI/ISIN/FIGI coverage for every listing | no universal identifier provider configured | identifier unresolved | GLEIF/OpenFIGI/licensed symbology |
| Qualitative moat claims | cannot be inferred reliably from ratios | quantitative evidence only | reviewed filings/transcripts with citations |
| Real-time entitlement on every venue | exchange licensing | delayed/near-real-time label reflects source | licensed exchange feeds |

## Field-level examples from the acceptance matrix

| Field / instrument | Reason | Providers attempted | Calculation dependency | Possible future source |
|---|---|---|---|---|
| STLAM.MI complete official ESEF history | official filing entry point is unresolved while ESEF ingestion is disabled | EODHD, FMP, Yahoo, ESEF | issuer LEI plus normalized filing facts | ESMA or the relevant national OAM |
| European UCITS ETF full holdings | configured Finnhub plan/listing coverage varies | Finnhub, FMP, Yahoo | verified fund identifier and holdings weights | licensed ETF holdings feed |
| BTC-USD on-chain flows | no configured provider has an on-chain contract | CoinGecko, Yahoo, Massive | wallet-labelled chain data | dedicated on-chain provider |
| Non-US insider transactions | disclosure regime and machine-readable coverage vary | Finnhub, FMP, local profile providers | verified issuer identity and official disclosure feed | national official register |
| Qualitative moat evidence | ratios do not prove durable competitive advantage | SEC/FMP/EODHD filings and structured metrics | cited competitive disclosures | reviewed filings/transcripts with citations |

FMP HTTP 429, Alpha Vantage rate limits and plan-restricted endpoints are runtime states, not permanent data gaps. The provider coordinator preserves stale validated data where allowed and reports the precise reason otherwise.
