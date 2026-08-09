export {};

type Check = { name: string; configured: boolean; ok: boolean; status: string };
const timeout = 18_000;

async function request(url: URL, headers?: HeadersInit) {
  try { const response = await fetch(url, { headers, redirect: "error", signal: AbortSignal.timeout(timeout) }); return { ok: response.ok, status: String(response.status) }; }
  catch (error) { return { ok: false, status: error instanceof Error ? error.name : "ERROR" }; }
}
async function routeRequest(url: URL) {
  try { const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(timeout) }); return { ok: response.status >= 200 && response.status < 400, status: String(response.status) }; }
  catch (error) { return { ok: false, status: error instanceof Error ? error.name : "ERROR" }; }
}

async function eodhd(): Promise<Check> {
  const token = process.env.EODHD_API_TOKEN?.trim(); if (!token) return { name: "EODHD", configured: false, ok: false, status: "NOT_CONFIGURED" };
  const url = new URL("https://eodhd.com/api/exchanges-list/"); url.searchParams.set("api_token", token); url.searchParams.set("fmt", "json");
  const authentication = await request(url);
  return { name: "EODHD", configured: true, ok: authentication.ok, status: authentication.status };
}
async function finnhub(): Promise<Check> {
  const token = process.env.FINNHUB_API_KEY?.trim(); if (!token) return { name: "FINNHUB", configured: false, ok: false, status: "NOT_CONFIGURED" };
  const url = new URL("https://finnhub.io/api/v1/stock/peers?symbol=AAPL"); return { name: "FINNHUB", configured: true, ...await request(url, { "X-Finnhub-Token": token }) };
}
async function coingecko(): Promise<Check> {
  const token = process.env.COINGECKO_API_KEY?.trim(); if (!token) return { name: "COINGECKO", configured: false, ok: false, status: "NOT_CONFIGURED" };
  const mode = process.env.COINGECKO_API_MODE === "demo" ? "demo" : "pro"; const url = new URL(`https://${mode === "demo" ? "api.coingecko.com" : "pro-api.coingecko.com"}/api/v3/coins/bitcoin`); url.searchParams.set("localization", "false"); url.searchParams.set("tickers", "false");
  return { name: "COINGECKO", configured: true, ...await request(url, { [mode === "demo" ? "x-cg-demo-api-key" : "x-cg-pro-api-key"]: token }) };
}
async function sec(): Promise<Check> {
  const userAgent = process.env.SEC_USER_AGENT?.trim(); if (!userAgent) return { name: "SEC_EDGAR", configured: false, ok: false, status: "NOT_CONFIGURED" };
  return { name: "SEC_EDGAR", configured: true, ...await request(new URL("https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json"), { "User-Agent": userAgent, "Accept-Encoding": "gzip, deflate" }) };
}
async function previewRoutes() {
  const base = process.env.COMPLETE_DATA_STACK_BASE_URL?.trim(); if (!base) return [];
  const paths = ["/", "/search", "/calendar", "/instrument/nasdaqgs/aapl/overview", "/instrument/nasdaqgs/nvda/overview", "/instrument/nasdaqgs/nvda/analysis", "/instrument/nasdaqgs/nvda/fundamentals/analysis", "/instrument/nasdaqgs/nvda/political", "/instrument/crypto/btc-usd/analysis", "/instrument/crypto/eth-usd/analysis", "/watchlists", "/portfolio"];
  return Promise.all(paths.map(async (path) => ({ path, ...await routeRequest(new URL(path, base)) })));
}

async function main() {
  const checks = await Promise.all([eodhd(), finnhub(), coingecko(), sec()]);
  for (const check of checks) process.stdout.write(`${check.name}: ${check.configured ? check.ok ? "OK" : `ERROR_${check.status}` : "NOT_CONFIGURED"}\n`);
  for (const route of await previewRoutes()) process.stdout.write(`ROUTE ${route.path}: ${route.ok ? "OK" : `ERROR_${route.status}`}\n`);
  process.stdout.write("SYMBOL_MATRIX: STLAM.MI, ENI.MI, AAPL, MSFT, NVDA, DUOL, NOW, RKLB, SPY, BTC-USD, ETH-USD, INVALID, MULTI_LISTING\n");
  if (checks.some((check) => check.configured && !check.ok)) process.exitCode = 1;
}

void main();
