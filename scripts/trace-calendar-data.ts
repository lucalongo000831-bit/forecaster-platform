import { traceDataPath } from "../src/services/data-v2/data-path-tracer";

const from = process.argv[2] ?? new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString().slice(0, 10);
const to = process.argv[3] ?? new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
async function main() {
  for (const category of ["EARNINGS", "DIVIDEND", "MACRO", "CENTRAL_BANK"]) {
    const trace = await traceDataPath({ dataset: "calendar", category, from, to });
    const prefix = category === "CENTRAL_BANK" ? "CENTRAL_BANK" : category;
    console.log(`${prefix}_SOURCE_RECORDS: ${trace.counts.raw}`);
    console.log(`${prefix}_NORMALIZED_RECORDS: ${trace.counts.normalized}`);
    console.log(`${prefix}_DB_EVENTS: ${trace.counts.database}`);
    console.log(`${prefix}_SNAPSHOT_EVENTS: ${trace.counts.snapshot}`);
    console.log(`${prefix}_API_EVENTS: ${trace.counts.apiConsumable}`);
    console.log(`${prefix}_UI_EVENTS: ${trace.counts.uiConsumable}`);
  }
}
void main();
