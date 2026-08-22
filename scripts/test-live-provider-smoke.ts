import { performance } from "node:perf_hooks";
import { ProviderError } from "../src/providers/errors";
import { financialProviderRouter } from "../src/providers/router";
import { isDeterministicE2EProviderEnabled } from "../src/providers/testing/deterministic-e2e-provider";

type AssetClass = "EQUITY" | "ETF" | "CRYPTO";
type SmokeStatus = "PASS" | "DEGRADED" | "FAIL";

const cases: Array<{ symbol: string; assetClass: AssetClass }> = [
  { symbol: "NVDA", assetClass: "EQUITY" },
  { symbol: "SPY", assetClass: "ETF" },
  { symbol: "BTC-USD", assetClass: "CRYPTO" },
];

function matchesAssetClass(quoteType: string, assetClass: AssetClass) {
  const type = quoteType.toUpperCase();
  if (assetClass === "ETF") return type.includes("ETF") || type.includes("FUND");
  if (assetClass === "CRYPTO") return type.includes("CRYPTO");
  return type.includes("EQUITY") || type.includes("STOCK");
}

async function smoke(input: (typeof cases)[number]) {
  const started = performance.now();
  try {
    const quote = await financialProviderRouter.quote(input.symbol);
    const chart = await financialProviderRouter.chart(input.symbol, "1M", "1d");
    const contractValid = quote.data.symbol === input.symbol
      && matchesAssetClass(quote.data.quoteType, input.assetClass)
      && quote.data.price > 0
      && chart.data.symbol === input.symbol
      && chart.data.points.length > 0;
    return {
      symbol: input.symbol,
      assetClass: input.assetClass,
      status: contractValid ? "PASS" as const : "FAIL" as const,
      provider: quote.meta.provider,
      latencyMs: Math.round(performance.now() - started),
      freshness: quote.meta.freshnessType,
      fallback: quote.meta.isFallback || chart.meta.isFallback,
      lkg: quote.meta.freshnessType === "STALE" || chart.meta.freshnessType === "STALE",
      rateLimited: false,
      errorCode: contractValid ? null : "CONTRACT_MISMATCH",
    };
  } catch (error) {
    const providerError = error instanceof ProviderError ? error : null;
    const controlled = Boolean(providerError);
    return {
      symbol: input.symbol,
      assetClass: input.assetClass,
      status: controlled ? "DEGRADED" as const : "FAIL" as const,
      provider: providerError?.provider ?? null,
      latencyMs: Math.round(performance.now() - started),
      freshness: "UNAVAILABLE" as const,
      fallback: false,
      lkg: false,
      rateLimited: providerError?.code === "RATE_LIMITED",
      errorCode: providerError?.code ?? "UNEXPECTED_ERROR",
    };
  }
}

async function main() {
  if (isDeterministicE2EProviderEnabled() || process.env.KAIRO_E2E_PROVIDER_FIXTURES === "true") {
    throw new Error("Live provider smoke refuses to run while deterministic E2E fixtures are requested.");
  }
  const results = [];
  for (const entry of cases) results.push(await smoke(entry));
  for (const result of results) process.stdout.write(`${JSON.stringify(result)}\n`);
  const summary: Record<AssetClass, SmokeStatus> = { EQUITY: "FAIL", ETF: "FAIL", CRYPTO: "FAIL" };
  for (const result of results) summary[result.assetClass] = result.status;
  process.stdout.write(`${JSON.stringify({ summary, controlledUnavailable: results.filter((result) => result.status === "DEGRADED").every((result) => result.errorCode !== "UNEXPECTED_ERROR") })}\n`);
  if (results.some((result) => result.status === "FAIL")) process.exitCode = 1;
}

void main();
