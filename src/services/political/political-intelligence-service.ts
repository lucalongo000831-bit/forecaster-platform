import "server-only";

import { PoliticalActivityEngine, PoliticalClusterEngine, PoliticalTradePerformanceEngine, filterPoliticalPeriod, politicalBreakdown, politicalTimeline } from "@/engines/political";
import { cacheGet, cacheSet } from "@/lib/server/redis";
import { financialProviderRouter } from "@/providers";
import { normalizeSymbol } from "@/services/yahoo/symbol-resolver";
import type { MarketChartPoint, PoliticalAssetProvenance, PoliticalFilters, PoliticalIntelligenceReport, PoliticalLeaderboardReport, PoliticalPeriod, PoliticalTransaction, PoliticianActivityReport } from "@/types";
import { politicalDataRouter } from "./political-data-router";
import { getPoliticalSyncHealth } from "./political-repository";
import { politicalCoverage } from "./political-coverage";
import { resolvePoliticalAssetContext } from "./political-asset-resolver";
import { derivePoliticalAssetDataStatus, politicalAssetCacheKey } from "./political-asset-state";

const activityEngine = new PoliticalActivityEngine(); const clusterEngine = new PoliticalClusterEngine(30); const performanceEngine = new PoliticalTradePerformanceEngine();
const EMPTY_STUDY = performanceEngine.historicalStudy([], []);

function rankAssets(transactions: PoliticalTransaction[], side: "PURCHASE" | "SALE") {
  const selected = transactions.filter((row) => side === "PURCHASE" ? row.transactionType === "PURCHASE" : row.transactionType.startsWith("SALE"));
  return politicalBreakdown(selected, (row) => row.symbol ?? `asset:${row.assetName}`, (key) => key.startsWith("asset:") ? key.slice(6) : key).slice(0, 12);
}

function priceOnOrAfter(points: MarketChartPoint[], date: string) { return points.find((point) => point.timestamp.slice(0, 10) >= date)?.close ?? null; }

function enrichPrices(transactions: PoliticalTransaction[], points: MarketChartPoint[], currentPrice: number | null) {
  return transactions.map((transaction) => {
    const priceAtTransaction = priceOnOrAfter(points, transaction.transactionDate); const priceAtDisclosure = priceOnOrAfter(points, transaction.disclosureDate);
    return { ...transaction, priceAtTransaction, priceAtDisclosure, currentPrice, sharesEstimate: transaction.estimatedAmount && priceAtTransaction ? transaction.estimatedAmount / priceAtTransaction : null };
  });
}

function sortedTransactions(transactions: PoliticalTransaction[], sort: PoliticalFilters["sort"] = "DISCLOSURE_DATE") {
  return [...transactions].sort((a, b) => {
    if (sort === "TRANSACTION_DATE") return b.transactionDate.localeCompare(a.transactionDate);
    if (sort === "AMOUNT") return (b.estimatedAmount ?? 0) - (a.estimatedAmount ?? 0);
    if (sort === "DELAY") return b.disclosureDelayDays - a.disclosureDelayDays;
    if (sort === "POLITICIAN") return a.politicianName.localeCompare(b.politicianName);
    return b.disclosureDate.localeCompare(a.disclosureDate);
  });
}

function breakdowns(transactions: PoliticalTransaction[]) {
  return {
    chamber: politicalBreakdown(transactions, (row) => row.chamber),
    party: politicalBreakdown(transactions, (row) => row.party),
    sector: politicalBreakdown(transactions, (row) => row.sector ?? "UNRESOLVED SECTOR"),
    politician: politicalBreakdown(transactions, (row) => row.politicianId, (id) => transactions.find((row) => row.politicianId === id)?.politicianName ?? id),
  };
}

function unresolved(transactions: PoliticalTransaction[]) {
  return transactions.filter((row) => row.resolutionStatus === "UNRESOLVED_ASSET").map((row) => ({ assetName: row.assetName, rawTicker: row.rawTicker, politicianName: row.politicianName, transactionDate: row.transactionDate, attemptedMappings: row.rawTicker ? ["canonical symbol", "FMP", "Yahoo", "EODHD", "SEC issuer resolution"] : ["asset description", "manual alias registry"] }));
}

function paginate<T>(values: T[], page: number, pageSize: number) { return values.slice((page - 1) * pageSize, page * pageSize); }

function applyFilters(transactions: PoliticalTransaction[], filters: PoliticalFilters) {
  const query = filters.query?.trim().toLowerCase();
  return transactions.filter((row) => {
    if (filters.chamber && filters.chamber !== "ALL" && row.chamber !== filters.chamber) return false;
    if (filters.party && filters.party !== "ALL" && row.party !== filters.party) return false;
    if (filters.transactionType && filters.transactionType !== "ALL" && row.transactionType !== filters.transactionType) return false;
    if (filters.ownerType && filters.ownerType !== "ALL" && row.ownerType !== filters.ownerType) return false;
    if (filters.sector && row.sector !== filters.sector) return false;
    if (filters.politician && !row.politicianName.toLowerCase().includes(filters.politician.toLowerCase())) return false;
    if (query && ![row.politicianName, row.assetName, row.symbol].some((value) => value?.toLowerCase().includes(query))) return false;
    return true;
  });
}

const politicalPeriods: PoliticalPeriod[] = ["7D", "30D", "90D", "6M", "1Y", "3Y", "5Y", "MAX"];

function availablePeriods(transactions: PoliticalTransaction[]) {
  return politicalPeriods.filter((period) => filterPoliticalPeriod(transactions, period).length > 0);
}

export async function getSymbolPoliticalIntelligence(symbolInput: string, filters: PoliticalFilters = {}): Promise<PoliticalIntelligenceReport> {
  const symbol = normalizeSymbol(decodeURIComponent(symbolInput)); const period = filters.period ?? "90D"; const page = Math.max(1, filters.page ?? 1); const pageSize = Math.min(100, Math.max(10, filters.pageSize ?? 20));
  const context = await resolvePoliticalAssetContext(symbol);
  const cacheKey = politicalAssetCacheKey(context.cacheIdentity, period); let loaded = await cacheGet<Awaited<ReturnType<typeof politicalDataRouter.getTradesByAssetContext>>>(cacheKey);
  if (!loaded) { loaded = await politicalDataRouter.getTradesByAssetContext(context, 5_000); await cacheSet(cacheKey, loaded, 900); }
  let periodRows = applyFilters(filterPoliticalPeriod(loaded.transactions, period), filters); let clusters = clusterEngine.analyze(periodRows);
  if (filters.clusterOnly) { const ids = new Set(clusters.flatMap((cluster) => cluster.transactionIds)); periodRows = periodRows.filter((row) => ids.has(row.id)); clusters = clusterEngine.analyze(periodRows); }
  const marketSymbol = context.canonicalSymbol;
  const [chart, benchmark, quote, profile] = await Promise.all([
    financialProviderRouter.analyticsChart(marketSymbol, "5Y", "1d").catch(() => null), financialProviderRouter.analyticsChart("SPY", "5Y", "1d").catch(() => null),
    financialProviderRouter.quote(marketSymbol).catch(() => null), financialProviderRouter.profile(marketSymbol).catch(() => null),
  ]);
  const priced = chart ? enrichPrices(periodRows, chart.data.points, quote?.data.price ?? chart.data.points.at(-1)?.close ?? null) : periodRows;
  const performances = chart && benchmark ? priced.slice(0, 100).map((transaction) => performanceEngine.calculate(transaction, chart.data.points, benchmark.data.points)) : [];
  const summary = activityEngine.summarize(priced, period, clusters); const breakdown = breakdowns(priced); const ordered = sortedTransactions(priced, filters.sort); const health = await getPoliticalSyncHealth(); const coverage = politicalCoverage(period, priced, loaded.transactions, health);
  const provenance: PoliticalAssetProvenance = { ...loaded.provenance, lastSuccessfulSync: health.lastSync };
  const dataStatus = derivePoliticalAssetDataStatus({ recordCount: priced.length, context, provenance, coverage });
  const resultStatus = dataStatus === "HAS_ACTIVITY" ? (provenance.databaseStatus === "AVAILABLE" ? "VERIFIED_ACTIVITY" : "PARTIAL_DATA") : dataStatus === "VERIFIED_ZERO" ? "VERIFIED_ZERO" : dataStatus === "UNRESOLVED_ASSET" ? "UNSUPPORTED" : dataStatus === "DATABASE_UNAVAILABLE" || dataStatus === "SOURCE_TEMPORARILY_UNAVAILABLE" ? "LAST_KNOWN_GOOD" : coverage.status;
  return {
    scope: "SYMBOL", symbol, name: profile?.data.name ?? quote?.data.name ?? symbol, period, summary, transactions: paginate(ordered, page, pageSize), totalTransactions: ordered.length, page, pageSize, totalPages: Math.max(1, Math.ceil(ordered.length / pageSize)),
    clusters, performances, historicalStudy: performanceEngine.historicalStudy(priced, performances), priceHistory: chart?.data.points ?? [], timeline: politicalTimeline(priced, period === "5Y" || period === "3Y" ? "monthly" : "weekly"),
    chamberBreakdown: breakdown.chamber, partyBreakdown: breakdown.party, sectorBreakdown: breakdown.sector, politicianBreakdown: breakdown.politician,
    mostPurchased: rankAssets(priced, "PURCHASE"), mostSold: rankAssets(priced, "SALE"), unresolvedAssets: unresolved(priced),
    sources: [...new Map(priced.map((row) => [row.provider, { provider: row.provider, label: row.provider === "fmp" ? "Financial Modeling Prep congressional disclosures" : row.provider === "bargo" ? "Bargo Congress API (secondary)" : "CapitolExposed Congress API (secondary historical)", url: row.provider === "bargo" ? "https://www.bargo.ai/free-apis/congress" : row.provider === "capitol-exposed" ? "https://www.capitolexposed.com/api-docs" : null, fetchedAt: row.fetchedAt, verificationStatus: row.verificationStatus }])).values()],
    limitations: [
      "Congressional financial disclosures may be reported after the transaction and commonly disclose value ranges rather than exact amounts.",
      "All post-disclosure analytics start on disclosureDate; transactionDate is never treated as market-available information.",
      ...(loaded.invalidRecords ? [`${loaded.invalidRecords} provider records without a disclosure date were excluded from market-availability analytics.`] : []),
      ...(unresolved(priced).length ? [`${unresolved(priced).length} disclosed assets could not be mapped to a canonical market instrument.`] : []),
      ...(provenance.databaseStatus !== "AVAILABLE" ? ["The canonical political database was unavailable; provider fallback responses cannot verify a true zero result."] : []),
      "Past post-disclosure performance does not imply future performance.",
    ], calculatedAt: new Date().toISOString(), resultStatus, dataStatus, coverage, canonicalResolution: context, provenance, availablePeriods: availablePeriods(loaded.transactions), activityOutsideSelectedPeriod: loaded.transactions.length > 0 && priced.length === 0,
  };
}

export async function getPoliticalLeaderboard(filters: PoliticalFilters = {}): Promise<PoliticalLeaderboardReport> {
  const period = filters.period ?? "90D"; const page = Math.max(1, filters.page ?? 1); const pageSize = Math.min(100, Math.max(10, filters.pageSize ?? 20)); const cacheKey = `political-intelligence:leaderboard:${JSON.stringify({ ...filters, period, page, pageSize })}`; const cached = await cacheGet<PoliticalLeaderboardReport>(cacheKey); if (cached) return cached;
  const loaded = await politicalDataRouter.getPoliticalLeaderboard(filters); let transactions = filterPoliticalPeriod(loaded.transactions, period); let clusters = clusterEngine.analyze(transactions);
  if (filters.clusterOnly) { const ids = new Set(clusters.flatMap((cluster) => cluster.transactionIds)); transactions = transactions.filter((row) => ids.has(row.id)); clusters = clusterEngine.analyze(transactions); }
  const summary = activityEngine.summarize(transactions, period, clusters); const breakdown = breakdowns(transactions); const ordered = sortedTransactions(transactions, filters.sort);
  const performances = await politicianPerformances(transactions.slice(0, 80));
  const health = await getPoliticalSyncHealth(); const coverage = politicalCoverage(period, transactions, loaded.transactions, health);
  const report: PoliticalLeaderboardReport = { period, summary, latest: paginate(ordered, page, pageSize), mostActivePoliticians: breakdown.politician.slice(0, 12), mostPurchased: rankAssets(transactions, "PURCHASE"), mostSold: rankAssets(transactions, "SALE"), clusters: clusters.slice(0, 12), sectors: breakdown.sector.slice(0, 12), timeline: politicalTimeline(transactions, period === "3Y" || period === "5Y" || period === "MAX" ? "monthly" : "weekly"), politicians: loaded.politicians, historicalStudy: performanceEngine.historicalStudy(transactions, performances), performanceSampleSize: performances.length, page, pageSize, totalPages: Math.max(1, Math.ceil(ordered.length / pageSize)), totalTransactions: transactions.length, mappedTransactions: transactions.filter((row) => row.resolutionStatus === "RESOLVED").length, unresolvedAssets: unresolved(transactions).length, duplicateRate: loaded.duplicateRate, verifiedRecords: transactions.filter((row) => row.verified).length, dataCompleteness: summary.dataCompleteness, calculatedAt: new Date().toISOString(), resultStatus: coverage.status, coverage };
  await cacheSet(cacheKey, report, 3_600); return report;
}

async function politicianPerformances(transactions: PoliticalTransaction[]) {
  const bySymbol = new Map<string, PoliticalTransaction[]>(); for (const row of transactions) if (row.symbol) bySymbol.set(row.symbol, [...(bySymbol.get(row.symbol) ?? []), row]);
  const benchmark = await financialProviderRouter.analyticsChart("SPY", "5Y", "1d").catch(() => null); if (!benchmark) return [];
  const results = [];
  for (const [symbol, rows] of [...bySymbol].slice(0, 8)) { const chart = await financialProviderRouter.analyticsChart(symbol, "5Y", "1d").catch(() => null); if (chart) results.push(...rows.slice(0, 20).map((row) => performanceEngine.calculate(row, chart.data.points, benchmark.data.points))); }
  return results;
}

export async function getPoliticianActivity(politicianId: string, period: PoliticalPeriod = "1Y"): Promise<PoliticianActivityReport | null> {
  const loaded = await politicalDataRouter.getPoliticianActivity(politicianId); const politician = loaded.politicians.find((item) => item.id === politicianId) ?? loaded.politicians.find((item) => item.displayName.toLowerCase().includes(politicianId.toLowerCase())); if (!politician) return null;
  const transactions = filterPoliticalPeriod(loaded.transactions.filter((row) => row.politicianId === politician.id), period); const clusters = clusterEngine.analyze(transactions); const performances = await politicianPerformances(transactions);
  return { politician, summary: activityEngine.summarize(transactions, period, clusters), transactions: sortedTransactions(transactions), mostTradedAssets: politicalBreakdown(transactions, (row) => row.symbol ?? row.assetName).slice(0, 12), sectorAllocation: politicalBreakdown(transactions, (row) => row.sector ?? "UNRESOLVED SECTOR").slice(0, 12), performances, historicalStudy: transactions.length ? performanceEngine.historicalStudy(transactions, performances) : EMPTY_STUDY, limitations: ["Disclosed activity is not a complete portfolio or a measure of total wealth.", "Amounts may be midpoint estimates from statutory disclosure ranges.", "Performance begins on the public disclosure date and is descriptive, not a copy-trading signal."], calculatedAt: new Date().toISOString() };
}

export function politicalCsv(transactions: PoliticalTransaction[]) {
  const columns = ["transactionDate", "disclosureDate", "disclosureDelayDays", "politicianName", "chamber", "party", "ownerType", "assetName", "symbol", "transactionType", "amountMin", "amountMax", "amountMethod", "provider", "sourceUrl"] as const;
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [columns.join(","), ...transactions.map((row) => columns.map((column) => escape(row[column])).join(","))].join("\n");
}
