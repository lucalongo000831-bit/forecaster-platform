type ProviderName = "FRED" | "BLS" | "BEA" | "EIA" | "MARKETAUX" | "OPENFIGI";
type ProviderStatus = "OK" | "AUTH_ERROR" | "RATE_LIMIT" | "ERROR";

interface SmokeCheck {
  name: ProviderName;
  environmentName: string;
  run: (credential: string) => Promise<ProviderStatus>;
}

const kairoDataV2TimeoutMs = 12_000;

function classifyHttpStatus(status: number): ProviderStatus | null {
  if (status === 401 || status === 403) return "AUTH_ERROR";
  if (status === 429) return "RATE_LIMIT";
  if (status < 200 || status >= 300) return "ERROR";
  return null;
}

function classifyMessage(value: unknown): ProviderStatus {
  const message = typeof value === "string" ? value.toLowerCase() : "";
  if (message.includes("rate") || message.includes("limit") || message.includes("quota")) return "RATE_LIMIT";
  if (message.includes("api key") || message.includes("apikey") || message.includes("token") || message.includes("registration")) return "AUTH_ERROR";
  return "ERROR";
}

async function fetchJson(url: URL, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(kairoDataV2TimeoutMs),
  });
  const status = classifyHttpStatus(response.status);
  if (status) return { status, body: null } as const;

  try {
    return { status: null, body: await response.json() as unknown } as const;
  } catch {
    return { status: "ERROR" as const, body: null };
  }
}

async function testFred(apiKey: string): Promise<ProviderStatus> {
  const url = new URL("/fred/series/observations", "https://api.stlouisfed.org");
  url.searchParams.set("series_id", "GNPCA");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("sort_order", "desc");
  const result = await fetchJson(url);
  if (result.status) return result.status;
  const body = result.body as Record<string, unknown>;
  if (Array.isArray(body?.observations)) return "OK";
  return classifyMessage(body?.error_message);
}

async function testBls(registrationKey: string): Promise<ProviderStatus> {
  const year = String(new Date().getUTCFullYear() - 1);
  const result = await fetchJson(new URL("/publicAPI/v2/timeseries/data/", "https://api.bls.gov"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seriesid: ["LNS14000000"], startyear: year, endyear: year, registrationkey: registrationKey }),
  });
  if (result.status) return result.status;
  const body = result.body as Record<string, unknown>;
  if (body?.status === "REQUEST_SUCCEEDED" && typeof body.Results === "object") return "OK";
  return classifyMessage(Array.isArray(body?.message) ? body.message.join(" ") : body?.message);
}

async function testBea(userId: string): Promise<ProviderStatus> {
  const url = new URL("/api/data", "https://apps.bea.gov");
  url.searchParams.set("UserID", userId);
  url.searchParams.set("method", "GETDATASETLIST");
  url.searchParams.set("ResultFormat", "JSON");
  const result = await fetchJson(url);
  if (result.status) return result.status;
  const body = result.body as { BEAAPI?: { Results?: { Dataset?: unknown[] }; Error?: { APIErrorDescription?: unknown } } };
  if (Array.isArray(body?.BEAAPI?.Results?.Dataset)) return "OK";
  return classifyMessage(body?.BEAAPI?.Error?.APIErrorDescription);
}

async function testEia(apiKey: string): Promise<ProviderStatus> {
  const url = new URL("/v2/electricity/", "https://api.eia.gov");
  url.searchParams.set("api_key", apiKey);
  const result = await fetchJson(url);
  if (result.status) return result.status;
  const body = result.body as { response?: { routes?: unknown[] }; error?: unknown };
  if (Array.isArray(body?.response?.routes)) return "OK";
  return classifyMessage(body?.error);
}

async function testMarketaux(apiToken: string): Promise<ProviderStatus> {
  const url = new URL("/v1/news/all", "https://api.marketaux.com");
  url.searchParams.set("api_token", apiToken);
  url.searchParams.set("limit", "1");
  url.searchParams.set("language", "en");
  const result = await fetchJson(url);
  if (result.status) return result.status;
  const body = result.body as { data?: unknown[]; error?: { message?: unknown } };
  if (Array.isArray(body?.data)) return "OK";
  return classifyMessage(body?.error?.message);
}

async function testOpenFigi(apiKey: string): Promise<ProviderStatus> {
  const result = await fetchJson(new URL("/v3/mapping", "https://api.openfigi.com"), {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-OPENFIGI-APIKEY": apiKey },
    body: JSON.stringify([{ idType: "ID_BB_GLOBAL", idValue: "BBG000BLNNH6" }]),
  });
  if (result.status) return result.status;
  if (Array.isArray(result.body) && result.body.length > 0 && typeof result.body[0] === "object") return "OK";
  return "ERROR";
}

const kairoDataV2Checks: SmokeCheck[] = [
  { name: "FRED", environmentName: "FRED_API_KEY", run: testFred },
  { name: "BLS", environmentName: "BLS_API_KEY", run: testBls },
  { name: "BEA", environmentName: "BEA_API_KEY", run: testBea },
  { name: "EIA", environmentName: "EIA_API_KEY", run: testEia },
  { name: "MARKETAUX", environmentName: "MARKETAUX_API_TOKEN", run: testMarketaux },
  { name: "OPENFIGI", environmentName: "OPENFIGI_API_KEY", run: testOpenFigi },
];

async function runKairoDataV2Smoke() {
  process.stdout.write("KAIRO DATA V2 PROVIDER SMOKE\n\n");
  let failed = false;
  const requestedProvider = process.argv[2]?.trim().toUpperCase();
  const activeChecks = requestedProvider
    ? kairoDataV2Checks.filter((check) => check.name === requestedProvider)
    : kairoDataV2Checks;

  if (activeChecks.length === 0) {
    process.stdout.write("UNKNOWN_PROVIDER: ERROR\n");
    process.exitCode = 1;
    return;
  }

  for (const check of activeChecks) {
    const credential = process.env[check.environmentName]?.trim();
    process.stdout.write(`${check.name}_CONFIGURED: ${credential ? "YES" : "NO"}\n`);
    let status: ProviderStatus = "ERROR";
    if (credential) {
      try {
        status = await check.run(credential);
      } catch {
        status = "ERROR";
      }
    }
    process.stdout.write(`${check.name}: ${status}\n\n`);
    if (status !== "OK") failed = true;
  }

  if (failed) process.exitCode = 1;
}

void runKairoDataV2Smoke();
