import type { PoliticalActivitySummary, PoliticalBreakdownRow, PoliticalCluster, PoliticalClusterStrength, PoliticalConfidence, PoliticalDirection, PoliticalPeriod, PoliticalTimelinePoint, PoliticalTransaction } from "@/types";

export const POLITICAL_ACTIVITY_MODEL_VERSION = "political-activity-v1" as const;
const saleTypes = new Set(["SALE", "SALE_FULL", "SALE_PARTIAL"]);
const periodDays: Record<PoliticalPeriod, number | null> = { "7D": 7, "30D": 30, "90D": 90, "6M": 183, "1Y": 365, "3Y": 1_095, "5Y": 1_826, MAX: null };
const clusterScore: Record<PoliticalClusterStrength, number> = { NONE: 0, WEAK: 35, MODERATE: 70, STRONG: 100 };

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const percentile = (values: number[], p: number) => { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); const index = (sorted.length - 1) * p; const lower = Math.floor(index); const upper = Math.ceil(index); return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (index - lower); };
const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

export function periodStart(period: PoliticalPeriod, asOf = new Date()) {
  const days = periodDays[period]; if (days === null) return null;
  return new Date(asOf.getTime() - days * 86_400_000).toISOString().slice(0, 10);
}

export function filterPoliticalPeriod(transactions: PoliticalTransaction[], period: PoliticalPeriod, asOf = new Date()) {
  const from = periodStart(period, asOf); const to = asOf.toISOString().slice(0, 10);
  return transactions.filter((transaction) => transaction.disclosureDate <= to && (!from || transaction.disclosureDate >= from));
}

function confidence(completeness: number, sample: number): PoliticalConfidence {
  const score = completeness * Math.min(1, sample / 20);
  return score >= 85 ? "VERY_HIGH" : score >= 68 ? "HIGH" : score >= 45 ? "MEDIUM" : score >= 20 ? "LOW" : "VERY_LOW";
}

function direction(score: number, sample: number): PoliticalDirection {
  if (!sample) return "INSUFFICIENT_DATA";
  if (score >= 55) return "STRONG_BUYING";
  if (score >= 20) return "BUYING";
  if (score <= -55) return "STRONG_SELLING";
  if (score <= -20) return "SELLING";
  return "BALANCED";
}

export class PoliticalActivityEngine {
  summarize(transactions: PoliticalTransaction[], period: PoliticalPeriod, clusters: PoliticalCluster[] = [], asOf = new Date()): PoliticalActivitySummary {
    const rows = filterPoliticalPeriod(transactions, period, asOf);
    const purchases = rows.filter((row) => row.transactionType === "PURCHASE"); const sales = rows.filter((row) => saleTypes.has(row.transactionType));
    const sum = (items: PoliticalTransaction[], field: "amountMin" | "amountMax" | "estimatedAmount") => items.reduce((total, item) => total + (item[field] ?? 0), 0);
    const purchaseMid = sum(purchases, "estimatedAmount"); const saleMid = sum(sales, "estimatedAmount"); const activity = purchaseMid + saleMid;
    const countDirection = rows.length ? (purchases.length - sales.length) / Math.max(1, purchases.length + sales.length) : 0;
    const valueDirection = activity ? (purchaseMid - saleMid) / activity : countDirection;
    const participantDirection = new Set(purchases.map((row) => row.politicianId)).size - new Set(sales.map((row) => row.politicianId)).size;
    const directionScore = clamp((valueDirection * .55 + countDirection * .3 + Math.max(-1, Math.min(1, participantDirection / 5)) * .15) * 100, -100, 100);
    const strongest = (side: "PURCHASE" | "SALE") => clusters.filter((cluster) => cluster.direction === side).sort((a, b) => clusterScore[b.strength] - clusterScore[a.strength])[0]?.strength ?? "NONE";
    const latest = rows[0]?.disclosureDate ?? null; const recencyDays = latest ? Math.max(0, Math.floor((asOf.getTime() - Date.parse(`${latest}T00:00:00Z`)) / 86_400_000)) : 999;
    const recencyScore = recencyDays <= 7 ? 100 : recencyDays <= 30 ? 80 : recencyDays <= 90 ? 55 : recencyDays <= 365 ? 30 : 10;
    const unique = new Set(rows.map((row) => row.politicianId)).size;
    const recent30 = rows.filter((row) => Date.parse(`${row.disclosureDate}T00:00:00Z`) >= asOf.getTime() - 30 * 86_400_000).length;
    const prior30 = rows.filter((row) => { const time = Date.parse(`${row.disclosureDate}T00:00:00Z`); return time < asOf.getTime() - 30 * 86_400_000 && time >= asOf.getTime() - 60 * 86_400_000; }).length;
    const acceleration = clamp(50 + (recent30 - prior30) / Math.max(1, prior30) * 25);
    const clusterStrength = Math.max(clusterScore[strongest("PURCHASE")], clusterScore[strongest("SALE")]);
    const activityIntensityScore = rows.length ? clamp(Math.abs(directionScore) * .25 + clamp(unique / 8 * 100) * .2 + clusterStrength * .2 + recencyScore * .15 + acceleration * .1 + clamp(Math.log10(activity + 1) / 7 * 100) * .1) : 0;
    const mapped = rows.filter((row) => row.resolutionStatus === "RESOLVED").length; const ranged = rows.filter((row) => row.amountMethod !== "UNKNOWN").length; const dated = rows.filter((row) => row.disclosureDate && row.transactionDate).length;
    const dataCompleteness = rows.length ? (mapped / rows.length * .4 + ranged / rows.length * .3 + dated / rows.length * .2 + .1) * 100 : 0;
    const delays = rows.map((row) => row.disclosureDelayDays).filter(Number.isFinite);
    return {
      period, from: periodStart(period, asOf), to: asOf.toISOString().slice(0, 10), purchaseCount: purchases.length, saleCount: sales.length,
      purchaseMin: sum(purchases, "amountMin"), purchaseMax: sum(purchases, "amountMax"), saleMin: sum(sales, "amountMin"), saleMax: sum(sales, "amountMax"),
      estimatedPurchaseValue: purchaseMid, estimatedSaleValue: saleMid, netEstimatedActivity: purchaseMid - saleMid, purchaseToSaleRatio: sales.length ? purchases.length / sales.length : purchases.length ? null : 0,
      uniquePoliticians: unique, uniqueBuyers: new Set(purchases.map((row) => row.politicianId)).size, uniqueSellers: new Set(sales.map((row) => row.politicianId)).size,
      houseCount: rows.filter((row) => row.chamber === "HOUSE").length, senateCount: rows.filter((row) => row.chamber === "SENATE").length,
      direction: direction(directionScore, rows.length), directionScore, activityIntensityScore, politicalActivityScore: activityIntensityScore,
      momentumScore: rows.length ? clamp(acceleration * .35 + clamp(new Set(purchases.map((row) => row.politicianId)).size / 6 * 100) * .3 + clusterScore[strongest("PURCHASE")] * .2 + recencyScore * .15) : 0,
      clusterBuying: strongest("PURCHASE"), clusterSelling: strongest("SALE"), lastDisclosureDate: latest,
      medianDisclosureDelay: percentile(delays, .5), averageDisclosureDelay: mean(delays), delayP25: percentile(delays, .25), delayP75: percentile(delays, .75), delayP90: percentile(delays, .9),
      dataCompleteness, confidence: confidence(dataCompleteness, rows.length), modelVersion: POLITICAL_ACTIVITY_MODEL_VERSION,
    };
  }
}

export function politicalBreakdown(transactions: PoliticalTransaction[], keyOf: (transaction: PoliticalTransaction) => string, labelOf: (key: string) => string = (key) => key): PoliticalBreakdownRow[] {
  const groups = new Map<string, PoliticalTransaction[]>();
  for (const transaction of transactions) { const key = keyOf(transaction) || "UNKNOWN"; groups.set(key, [...(groups.get(key) ?? []), transaction]); }
  return [...groups].map(([key, rows]) => {
    const purchases = rows.filter((row) => row.transactionType === "PURCHASE"); const sales = rows.filter((row) => saleTypes.has(row.transactionType));
    const estimatedActivity = rows.reduce((sum, row) => sum + (row.estimatedAmount ?? 0), 0); const directional = (purchases.length - sales.length) / Math.max(1, purchases.length + sales.length) * 100;
    return { key, label: labelOf(key), purchaseCount: purchases.length, saleCount: sales.length, uniquePoliticians: new Set(rows.map((row) => row.politicianId)).size, estimatedActivity, direction: direction(directional, rows.length), intensity: clamp(rows.length / 12 * 100) };
  }).sort((a, b) => b.estimatedActivity - a.estimatedActivity || b.purchaseCount + b.saleCount - a.purchaseCount - a.saleCount);
}

export function politicalTimeline(transactions: PoliticalTransaction[], granularity: "daily" | "weekly" | "monthly" = "weekly"): PoliticalTimelinePoint[] {
  const key = (date: string) => granularity === "monthly" ? date.slice(0, 7) : granularity === "weekly" ? (() => { const current = new Date(`${date}T00:00:00Z`); current.setUTCDate(current.getUTCDate() - current.getUTCDay()); return current.toISOString().slice(0, 10); })() : date;
  const points = new Map<string, PoliticalTimelinePoint>();
  for (const transaction of transactions) { const date = key(transaction.disclosureDate); const point = points.get(date) ?? { date, purchases: 0, sales: 0, estimatedActivity: 0 }; if (transaction.transactionType === "PURCHASE") point.purchases += 1; else if (saleTypes.has(transaction.transactionType)) point.sales += 1; point.estimatedActivity += transaction.estimatedAmount ?? 0; points.set(date, point); }
  return [...points.values()].sort((a, b) => a.date.localeCompare(b.date));
}
