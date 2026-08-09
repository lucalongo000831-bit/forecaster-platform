export {};

const symbolIndex = process.argv.indexOf("--symbol");
const symbol = symbolIndex >= 0 ? process.argv[symbolIndex + 1] : null;
if (!symbol || !/^[A-Za-z0-9.^=-]{1,24}$/.test(symbol)) throw new Error("Usage: npm run issuer:backfill -- --symbol STLAM.MI");
const baseUrl = (process.env.KAIRO_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const response = await fetch(`${baseUrl}/api/company/${encodeURIComponent(symbol)}/report`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(120_000) });
if (!response.ok) throw new Error(`Backfill failed with HTTP ${response.status}`);
const body = await response.json() as { data?: { modelVersion?: string; calculatedAt?: string; coverage?: { applicableDataCoverage?: number } } };
const report = body.data ?? {};
console.log(`ISSUER_BACKFILL: OK`);
console.log(`SYMBOL: ${symbol.toUpperCase()}`);
console.log(`MODEL: ${report.modelVersion ?? "unknown"}`);
console.log(`CALCULATED_AT: ${report.calculatedAt ?? "unknown"}`);
console.log(`APPLICABLE_COMPLETENESS: ${report.coverage?.applicableDataCoverage?.toFixed(1) ?? "unknown"}%`);
