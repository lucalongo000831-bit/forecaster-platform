import { BargoCongressAdapter } from "../src/providers/political/bargo-adapter";
import { CapitolExposedCongressAdapter } from "../src/providers/political/capitol-exposed-adapter";
import { FmpPoliticalAdapter } from "../src/providers/political/fmp-adapter";

function status(error: unknown) { const message = error instanceof Error ? error.message.toLowerCase() : ""; return message.includes("429") || message.includes("rate") ? "RATE_LIMIT" : message.includes("plan") || message.includes("403") ? "PLAN_LIMIT" : "ERROR"; }
async function probe(label: string, task: () => Promise<unknown>) { try { await task(); process.stdout.write(`${label}: OK\n`); } catch (error) { process.stdout.write(`${label}: ${status(error)}\n`); } }
async function main() {
  await probe("BARGO", () => new BargoCongressAdapter().healthCheck());
  const fmp = new FmpPoliticalAdapter(); process.stdout.write(`FMP: ${fmp.isConfigured() ? "CONFIGURED" : "NOT_CONFIGURED"}\n`); if (fmp.isConfigured()) await probe("FMP_READ", () => fmp.getHouseTrades(undefined, 1));
  await probe("CAPITOL_EXPOSED", () => new CapitolExposedCongressAdapter().healthCheck());
  process.stdout.write("HOUSE_OFFICIAL: PARTIAL\n");
  process.stdout.write("SENATE_OFFICIAL: PARTIAL\n");
}
void main();
