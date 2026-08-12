import { traceDataPath } from "../src/services/data-v2/data-path-tracer";

const from = process.argv[2] ?? new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString().slice(0, 10);
const to = process.argv[3] ?? new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
async function main() { for (const category of ["EARNINGS", "DIVIDEND", "MACRO", "CENTRAL_BANK"]) console.log(JSON.stringify(await traceDataPath({ dataset: "calendar", category, from, to }))); }
void main();
