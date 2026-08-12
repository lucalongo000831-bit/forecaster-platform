import { createRequestContext, enforceRateLimit, jsonFailure, jsonSuccess } from "@/lib/server";
import { getPoliticalSyncHealth } from "@/services/political";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = createRequestContext(request);
  try { await enforceRateLimit(context.ip, { scope: "political-history-health", limit: 20 }); const health = await getPoliticalSyncHealth(); return jsonSuccess({ earliest: health.earliestDisclosure, latest: health.latestDisclosure, days: health.historyDays, years: health.historyYears, totalRecords: health.totalRecords, house: health.houseRecords, senate: health.senateRecords, mapped: health.mappedInstruments, unresolved: health.unresolvedAssets, duplicates: health.duplicatesRemoved, mappingRate: health.mappingRate, operationalStatus: health.operationalStatus, months: health.historyMonths }, context, { headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=300" } }); }
  catch (error) { return jsonFailure(error, context); }
}
