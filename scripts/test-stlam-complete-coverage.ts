export {};

const baseArg = process.argv.find((value) => value.startsWith("--base-url="));
const baseUrl = (baseArg?.slice("--base-url=".length) || process.env.KAIRO_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const symbol = "STLAM.MI";

async function json(path: string) {
  const response = await fetch(`${baseUrl}${path}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  const body = await response.json() as { data?: unknown };
  return body.data ?? body;
}

function status(value: unknown) { return value ? "OK" : "ERROR"; }

const report = await json(`/api/company/${encodeURIComponent(symbol)}/report`) as Record<string, unknown>;
const coverage = report.coverage as { rawDataCoverage: number; applicableDataCoverage: number; sections: Array<{ section: string; percentage: number }>; missingFields: string[] } | undefined;
const sourceProviders = new Set(((report.sources as Array<{ provider?: string }> | undefined) ?? []).map((item) => item.provider));
const section = (name: string) => coverage?.sections.find((item) => item.section.toUpperCase() === name.toUpperCase())?.percentage ?? 0;
const pipeline = (report.pipeline as Array<{ name: string; status: string }> | undefined) ?? [];
const stage = (name: string) => pipeline.find((item) => item.name === name)?.status;

const coverageFields = (coverage as { fields?: Array<{ field: string; status: string }> } | undefined)?.fields ?? [];
const available = (field: string) => coverageFields.find((item) => item.field === field)?.status === "AVAILABLE";
console.log(`ISSUER_RESOLUTION: ${status(available("Identity.canonicalIssuer") && available("Identity.cik") && available("Identity.isin"))}`);
console.log(`MULTI_LISTING: ${status(available("Identity.listings"))}`);
for (const provider of ["EODHD", "FMP", "FINNHUB", "SEC", "ESEF", "OFFICIAL_FILINGS"] as const) {
  const ok = provider === "SEC" ? sourceProviders.has("sec-edgar") : provider === "OFFICIAL_FILINGS" ? stage("LoadOfficialIssuerMetrics") === "complete" : sourceProviders.has(provider.toLowerCase().replace("_FILINGS", ""));
  console.log(`${provider}: ${ok ? "OK" : provider === "ESEF" || provider === "OFFICIAL_FILINGS" ? "PARTIAL" : "ERROR"}`);
}
for (const [label, name] of [["INCOME_STATEMENT", "Income Statement"], ["BALANCE_SHEET", "Balance Sheet"], ["CASH_FLOW", "Cash Flow"], ["VALUATION", "Valuation"], ["ANALYST", "Analyst"], ["PEERS", "Peers"], ["MANAGEMENT", "Management"], ["MOAT", "Moat"], ["DIVIDENDS", "Dividends"], ["INSIDERS", "Insiders"], ["OWNERSHIP", "Ownership"], ["TECHNICAL", "Technicals"], ["SEASONALITY", "Seasonality"], ["FORECAST", "Forecast"]] as const) console.log(`${label}: ${section(name).toFixed(1)}%`);
console.log(`RAW_DATA_COMPLETENESS: ${(coverage?.rawDataCoverage ?? 0).toFixed(1)}%`);
console.log(`APPLICABLE_COMPLETENESS: ${(coverage?.applicableDataCoverage ?? 0).toFixed(1)}%`);
console.log("MISSING:");
for (const field of coverage?.missingFields ?? []) console.log(field);
