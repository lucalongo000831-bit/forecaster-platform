import { backfillPoliticalHistoryV3 } from "../src/services/political/political-ingestion-service";

function argument(name: string) { const prefix = `--${name}=`; return process.argv.slice(2).find((item) => item.startsWith(prefix))?.slice(prefix.length); }
const fromInput = argument("from"); const toInput = argument("to");
if (!fromInput || !toInput) throw new Error("Usage: npm run political:v3:backfill -- --from=YYYY-MM-DD --to=YYYY-MM-DD [--resume] [--dry-run] [--batch-days=30]");
const from: string = fromInput; const to: string = toInput;
const source = argument("source") ?? "capitol-exposed";
if (!['capitol-exposed', 'bargo'].includes(source)) throw new Error("Unsupported source. Use capitol-exposed or bargo.");
if (source === "bargo" && Date.parse(to) - Date.parse(from) > 100 * 86_400_000) throw new Error("Bargo keyless documents only about three months of history; use capitol-exposed for 1Y backfill.");
async function main() {
  const result = await backfillPoliticalHistoryV3({ from, to, source: source as "bargo" | "capitol-exposed", resume: process.argv.includes("--resume"), dryRun: process.argv.includes("--dry-run"), batchDays: Number(argument("batch-days") ?? 30), maxPages: Number(argument("max-pages") ?? 150), pageSize: Number(argument("page-size") ?? 100), chamber: argument("chamber")?.toUpperCase() as "HOUSE" | "SENATE" | undefined });
  const months = "monthCoverage" in result && result.monthCoverage ? result.monthCoverage.map((item) => ({ month: item.month, status: item.status, records: item.recordCount, house: item.houseRecords, senate: item.senateRecords })) : [];
  process.stdout.write(`${JSON.stringify({ status: result.status, provider: "provider" in result ? result.provider : null, fetched: result.fetched, processed: result.processed, skipped: "skipped" in result ? result.skipped : 0, duplicatesRemoved: "duplicatesRemoved" in result ? result.duplicatesRemoved : 0, months }, null, 2)}\n`);
}
void main();
