import { getGlobalRiskCurrent } from "../src/services/global-risk/global-risk-service";

async function main() { const snapshot = await getGlobalRiskCurrent(); const metrics = snapshot.components.flatMap((component) => component.metrics); const counts = Object.groupBy(metrics, (metric) => metric.dataType); console.log(JSON.stringify({ directAndCalculatedCoverage: snapshot.directDataCoverage, effectiveCoverage: snapshot.dataCompleteness, proxyShare: snapshot.proxyShare, metrics: Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, value?.length ?? 0])), missing: metrics.filter((metric) => metric.dataType === "MISSING" || metric.dataType === "UNAVAILABLE").map((metric) => `${metric.key}:${metric.source}`) }, null, 2)); }
void main();
