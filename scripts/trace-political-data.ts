import { traceDataPath } from "../src/services/data-v2/data-path-tracer";

const symbol = process.argv[2] ?? "NVDA";
const to = new Date().toISOString().slice(0, 10); const from = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
void traceDataPath({ dataset: "political", symbol, from, to }).then((trace) => console.log(JSON.stringify(trace, null, 2)));
