import type { PoliticalCluster, PoliticalClusterStrength, PoliticalConfidence, PoliticalTransaction } from "@/types";
import { stablePoliticalId } from "./normalization";

export const POLITICAL_CLUSTER_MODEL_VERSION = "political-cluster-v1" as const;
const saleTypes = new Set(["SALE", "SALE_FULL", "SALE_PARTIAL"]);

function strength(uniquePoliticians: number, amount: number, recencyDays: number): PoliticalClusterStrength {
  if (uniquePoliticians < 2) return "NONE";
  const recencyBoost = recencyDays <= 7 ? 1 : recencyDays <= 30 ? .8 : .5;
  const score = uniquePoliticians * 18 + Math.min(25, Math.log10(Math.max(1, amount)) * 3) * recencyBoost;
  return score >= 90 ? "STRONG" : score >= 60 ? "MODERATE" : "WEAK";
}

function confidence(uniquePoliticians: number): PoliticalConfidence {
  return uniquePoliticians >= 6 ? "VERY_HIGH" : uniquePoliticians >= 4 ? "HIGH" : uniquePoliticians >= 3 ? "MEDIUM" : uniquePoliticians >= 2 ? "LOW" : "VERY_LOW";
}

export class PoliticalClusterEngine {
  constructor(private readonly windowDays = 30) {}

  analyze(transactions: PoliticalTransaction[], asOf = new Date()): PoliticalCluster[] {
    const groups = new Map<string, PoliticalTransaction[]>();
    for (const transaction of transactions) {
      const side = transaction.transactionType === "PURCHASE" ? "PURCHASE" : saleTypes.has(transaction.transactionType) ? "SALE" : null;
      if (!side || !transaction.symbol) continue;
      const key = `${transaction.symbol}:${side}`; groups.set(key, [...(groups.get(key) ?? []), transaction]);
    }
    const clusters: PoliticalCluster[] = [];
    for (const [key, rows] of groups) {
      const sorted = [...rows].sort((a, b) => a.disclosureDate.localeCompare(b.disclosureDate));
      for (let start = 0; start < sorted.length; start += 1) {
        const from = Date.parse(`${sorted[start]!.disclosureDate}T00:00:00Z`);
        const window = sorted.slice(start).filter((row) => Date.parse(`${row.disclosureDate}T00:00:00Z`) - from <= this.windowDays * 86_400_000);
        const politicians = [...new Set(window.map((row) => row.politicianId))];
        const estimatedAmount = window.reduce((sum, row) => sum + (row.estimatedAmount ?? 0) * (row.ownerType === "SPOUSE" ? .8 : 1), 0);
        const lastDate = window.at(-1)?.disclosureDate ?? sorted[start]!.disclosureDate;
        const recency = Math.max(0, Math.floor((asOf.getTime() - Date.parse(`${lastDate}T00:00:00Z`)) / 86_400_000));
        const clusterStrength = strength(politicians.length, estimatedAmount, recency);
        if (clusterStrength === "NONE") continue;
        const [symbol, direction] = key.split(":") as [string, "PURCHASE" | "SALE"];
        clusters.push({ id: `cluster-${stablePoliticalId(key, sorted[start]!.disclosureDate, lastDate, politicians.join(","))}`, symbol, direction, strength: clusterStrength, windowDays: this.windowDays, uniquePoliticians: politicians.length, transactionCount: window.length, estimatedAmount, chamberCount: new Set(window.map((row) => row.chamber)).size, firstDisclosureDate: window[0]!.disclosureDate, lastDisclosureDate: lastDate, politicianIds: politicians, transactionIds: window.map((row) => row.id), confidence: confidence(politicians.length), modelVersion: POLITICAL_CLUSTER_MODEL_VERSION });
      }
    }
    const strongest = new Map<string, PoliticalCluster>();
    const rank = { NONE: 0, WEAK: 1, MODERATE: 2, STRONG: 3 };
    for (const cluster of clusters) {
      const key = `${cluster.symbol}:${cluster.direction}`; const previous = strongest.get(key);
      if (!previous || rank[cluster.strength] > rank[previous.strength] || cluster.uniquePoliticians > previous.uniquePoliticians) strongest.set(key, cluster);
    }
    return [...strongest.values()].sort((a, b) => b.uniquePoliticians - a.uniquePoliticians || b.estimatedAmount - a.estimatedAmount);
  }
}
