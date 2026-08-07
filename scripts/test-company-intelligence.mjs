#!/usr/bin/env node

const baseUrl = (process.env.COMPANY_SMOKE_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const strictProviders = process.env.COMPANY_SMOKE_STRICT === "true";

const cases = [
  ["AAPL", "equity"], ["MSFT", "equity"], ["NVDA", "equity"], ["AMZN", "equity"],
  ["META", "equity"], ["GOOGL", "equity"], ["TSLA", "equity"], ["DUOL", "equity"],
  ["NOW", "equity"], ["RKLB", "equity"], ["STLAM.MI", "equity"], ["ENI.MI", "equity"],
  ["JPM", "bank"], ["ALL", "insurance"], ["NEE", "utility"], ["F", "cyclical"],
  ["RIVN", "unprofitable-negative-fcf"], ["CCL", "high-debt"], ["ARM", "recent-listing"],
  ["SPY", "etf"], ["^GSPC", "index"], ["BTC-USD", "crypto"],
  ["THIS-TICKER-SHOULD-NOT-EXIST", "missing"],
];

const controlledFailures = new Set([404, 429, 502, 503, 504]);
const nonCorporate = new Set(["etf", "index", "crypto"]);
const outcomes = [];

function assertFiniteJson(value, path = "data") {
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`${path} is not finite`);
  if (Array.isArray(value)) value.forEach((item, index) => assertFiniteJson(item, `${path}[${index}]`));
  else if (value && typeof value === "object") Object.entries(value).forEach(([key, item]) => assertFiniteJson(item, `${path}.${key}`));
}

for (const [symbol, expectedClass] of cases) {
  const response = await fetch(`${baseUrl}/api/company/${encodeURIComponent(symbol)}/analysis`, {
    headers: { "x-forwarded-for": `198.51.100.${outcomes.length + 1}` },
    signal: AbortSignal.timeout(45_000),
  }).catch((error) => ({ ok: false, status: 0, error }));

  if (response.status === 0) {
    outcomes.push({ symbol, expectedClass, status: "UNREACHABLE", passed: false });
    continue;
  }

  const payload = await response.json().catch(() => null);
  if (response.ok) {
    const report = payload?.data;
    assertFiniteJson(report);
    if (!report || typeof report.symbol !== "string" || typeof report.applicable !== "boolean") throw new Error(`${symbol}: invalid report contract`);
    if (nonCorporate.has(expectedClass) && report.applicable) throw new Error(`${symbol}: corporate analysis must be not applicable for ${expectedClass}`);
    if (!nonCorporate.has(expectedClass) && expectedClass !== "missing" && !report.applicable) throw new Error(`${symbol}: expected an applicable company report`);
    outcomes.push({ symbol, expectedClass, status: `HTTP ${response.status}`, passed: true, applicable: report.applicable, confidence: report.confidence });
    continue;
  }

  const controlled = controlledFailures.has(response.status) && typeof payload?.error?.code === "string";
  const expectedMissing = expectedClass === "missing" && response.status === 404;
  outcomes.push({ symbol, expectedClass, status: `HTTP ${response.status}`, passed: expectedMissing || (!strictProviders && controlled), error: payload?.error?.code ?? "INVALID_ERROR" });
}

for (const outcome of outcomes) console.log(JSON.stringify(outcome));
const failures = outcomes.filter((outcome) => !outcome.passed);
console.log(JSON.stringify({ summary: { total: outcomes.length, passed: outcomes.length - failures.length, failed: failures.length, strictProviders } }));
if (failures.length) process.exitCode = 1;
