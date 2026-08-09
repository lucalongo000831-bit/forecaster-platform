export {};

type ProviderResult = { configured: boolean; ok: boolean };

const timeoutMs = 12_000;

async function safeRequest(url: URL, headers?: HeadersInit): Promise<boolean> {
  try {
    const response = await fetch(url, {
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function testEodhd(): Promise<ProviderResult> {
  const token = process.env.EODHD_API_TOKEN?.trim();
  if (!token) return { configured: false, ok: false };

  const url = new URL("https://eodhd.com/api/exchanges-list/");
  url.searchParams.set("api_token", token);
  url.searchParams.set("fmt", "json");
  return { configured: true, ok: await safeRequest(url) };
}

async function testFinnhub(): Promise<ProviderResult> {
  const apiKey = process.env.FINNHUB_API_KEY?.trim();
  if (!apiKey) return { configured: false, ok: false };

  const url = new URL("https://finnhub.io/api/v1/stock/profile2");
  url.searchParams.set("symbol", "AAPL");
  return { configured: true, ok: await safeRequest(url, { "X-Finnhub-Token": apiKey }) };
}

async function testCoinGecko(): Promise<ProviderResult & { mode: "demo" | "pro" }> {
  const apiKey = process.env.COINGECKO_API_KEY?.trim();
  const mode = process.env.COINGECKO_API_MODE === "demo" ? "demo" : "pro";
  if (!apiKey) return { configured: false, ok: false, mode };

  const baseUrl = mode === "pro" ? "https://pro-api.coingecko.com/api/v3/" : "https://api.coingecko.com/api/v3/";
  const headerName = mode === "pro" ? "x-cg-pro-api-key" : "x-cg-demo-api-key";
  const url = new URL("simple/price", baseUrl);
  url.searchParams.set("ids", "bitcoin");
  url.searchParams.set("vs_currencies", "usd");
  return { configured: true, ok: await safeRequest(url, { [headerName]: apiKey }), mode };
}

async function testSec(): Promise<ProviderResult> {
  const userAgent = process.env.SEC_USER_AGENT?.trim();
  if (!userAgent) return { configured: false, ok: false };

  const url = new URL("https://data.sec.gov/submissions/CIK0000320193.json");
  const ok = await safeRequest(url, {
    "User-Agent": userAgent,
    "Accept-Encoding": "gzip, deflate",
    Host: "data.sec.gov",
  });
  return { configured: true, ok };
}

async function main() {
  const [eodhd, finnhub, coinGecko, sec] = await Promise.all([
    testEodhd(),
    testFinnhub(),
    testCoinGecko(),
    testSec(),
  ]);

  process.stdout.write(`EODHD_CONFIGURED: ${eodhd.configured ? "YES" : "NO"}\n`);
  process.stdout.write(`EODHD_AUTH: ${eodhd.ok ? "OK" : "ERROR"}\n`);
  process.stdout.write(`FINNHUB_CONFIGURED: ${finnhub.configured ? "YES" : "NO"}\n`);
  process.stdout.write(`FINNHUB_AUTH: ${finnhub.ok ? "OK" : "ERROR"}\n`);
  process.stdout.write(`COINGECKO_CONFIGURED: ${coinGecko.configured ? "YES" : "NO"}\n`);
  process.stdout.write(`COINGECKO_MODE: ${coinGecko.mode.toUpperCase()}\n`);
  process.stdout.write(`COINGECKO_AUTH: ${coinGecko.ok ? "OK" : "ERROR"}\n`);
  process.stdout.write(`SEC_USER_AGENT_CONFIGURED: ${sec.configured ? "YES" : "NO"}\n`);
  process.stdout.write(`SEC_EDGAR_ACCESS: ${sec.ok ? "OK" : "ERROR"}\n`);
}

void main();
