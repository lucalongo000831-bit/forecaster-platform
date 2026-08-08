type Check = { label: string; run: () => Promise<boolean> };

const timeoutMs = 12_000;
const today = new Date();
const from = new Date(today.getTime() - 14 * 86_400_000).toISOString().slice(0, 10);
const to = today.toISOString().slice(0, 10);

async function request(url: URL, headers?: HeadersInit) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs), redirect: "error" });
  if (!response.ok) return false;
  const body: unknown = await response.json();
  if (!body || typeof body !== "object") return false;
  const record = body as Record<string, unknown>;
  return !record["Error Message"] && !record.error && !record.Note && !record.Information;
}

function massive(path: string, params: Record<string, string> = {}) {
  const key = process.env.MASSIVE_API_KEY ?? process.env.POLYGON_API_KEY;
  if (!key) return async () => false;
  return async () => {
    const url = new URL(path, process.env.MASSIVE_BASE_URL ?? "https://api.massive.com");
    Object.entries(params).forEach(([name, value]) => url.searchParams.set(name, value));
    return request(url, { Authorization: `Bearer ${key}` });
  };
}

function massiveQuote() {
  const key = process.env.MASSIVE_API_KEY ?? process.env.POLYGON_API_KEY;
  if (!key) return async () => false;
  return async () => {
    const snapshot = new URL("/v3/snapshot", process.env.MASSIVE_BASE_URL ?? "https://api.massive.com");
    snapshot.searchParams.set("ticker", "AAPL"); snapshot.searchParams.set("market_type", "stocks");
    if (await request(snapshot, { Authorization: `Bearer ${key}` })) return true;
    const aggregates = new URL(`/v2/aggs/ticker/AAPL/range/1/minute/${from}/${to}`, process.env.MASSIVE_BASE_URL ?? "https://api.massive.com");
    aggregates.searchParams.set("adjusted", "true"); aggregates.searchParams.set("sort", "desc"); aggregates.searchParams.set("limit", "1");
    return request(aggregates, { Authorization: `Bearer ${key}` });
  };
}

function fmp(path: string, params: Record<string, string> = {}) {
  const key = process.env.FMP_API_KEY;
  if (!key) return async () => false;
  return async () => {
    const url = new URL(`/stable/${path}`, process.env.FMP_BASE_URL ?? "https://financialmodelingprep.com");
    Object.entries(params).forEach(([name, value]) => url.searchParams.set(name, value));
    return request(url, { apikey: key });
  };
}

function alpha(params: Record<string, string>) {
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!key) return async () => false;
  return async () => {
    const url = new URL("/query", process.env.ALPHA_VANTAGE_BASE_URL ?? "https://www.alphavantage.co");
    Object.entries({ ...params, apikey: key }).forEach(([name, value]) => url.searchParams.set(name, value));
    return request(url);
  };
}

const checks: Check[] = [
  { label: "MASSIVE_AUTH", run: massive("/v3/reference/tickers/AAPL") },
  { label: "MASSIVE_QUOTES", run: massiveQuote() },
  { label: "MASSIVE_TRADES", run: massive("/v2/last/trade/AAPL") },
  { label: "MASSIVE_AGGREGATES", run: massive(`/v2/aggs/ticker/AAPL/range/1/day/${from}/${to}`, { adjusted: "true", sort: "asc" }) },
  { label: "MASSIVE_MARKET_STATUS", run: massive("/v1/marketstatus/now") },
  { label: "FMP_AUTH", run: fmp("profile", { symbol: "AAPL" }) },
  { label: "FMP_PROFILE", run: fmp("profile", { symbol: "AAPL" }) },
  { label: "FMP_FINANCIALS", run: fmp("income-statement", { symbol: "AAPL", limit: "1" }) },
  { label: "FMP_EARNINGS", run: fmp("earnings-calendar", { from, to }) },
  { label: "FMP_DIVIDENDS", run: fmp("dividends-calendar", { from, to }) },
  { label: "FMP_ECONOMIC_CALENDAR", run: fmp("economic-calendar", { from, to }) },
  { label: "FMP_ANALYST_DATA", run: fmp("analyst-estimates", { symbol: "AAPL", period: "annual", limit: "1" }) },
  { label: "FMP_PRICE_TARGETS", run: fmp("price-target-consensus", { symbol: "AAPL" }) },
  { label: "FMP_SENATE", run: fmp("senate-latest", { page: "0", limit: "1" }) },
  { label: "FMP_HOUSE", run: fmp("house-latest", { page: "0", limit: "1" }) },
  { label: "ALPHA_AUTH", run: alpha({ function: "GLOBAL_QUOTE", symbol: "AAPL" }) },
  { label: "ALPHA_NEWS_SENTIMENT", run: alpha({ function: "NEWS_SENTIMENT", tickers: "AAPL", limit: "1" }) },
  { label: "ALPHA_MACRO", run: alpha({ function: "FEDERAL_FUNDS_RATE", interval: "monthly" }) },
];

async function main() {
  for (const check of checks) {
    let ok = false;
    try { ok = await check.run(); } catch { ok = false; }
    process.stdout.write(`${check.label}: ${ok ? "OK" : "ERROR"}\n`);
  }
}

void main();
