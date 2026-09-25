import type { MarketStructureResult, TechnicalConfluenceV4, TechnicalCrossAssetResult, TechnicalDivergenceResult, TechnicalStructureV4Result } from "@/types";

export function calculateTechnicalConfluenceV4(input: { structure: MarketStructureResult | null; advanced: TechnicalStructureV4Result | null; divergences: TechnicalDivergenceResult | null; crossAsset: TechnicalCrossAssetResult | null }): TechnicalConfluenceV4 {
  const contributors: TechnicalConfluenceV4["contributors"] = [];
  if (input.structure?.status === "AVAILABLE") {
    const value = input.structure.state === "UPTREND" ? 80 : input.structure.state === "DOWNTREND" ? 20 : 50;
    contributors.push({ id: "structure", label: "Confirmed structure", value, weight: 0.4, explanation: `${input.structure.state} from confirmed pivots and close breaks.` });
  }
  if (input.advanced?.status === "AVAILABLE") {
    const bullish = input.advanced.sweeps.filter((event) => event.direction === "BULLISH").length + input.advanced.displacements.filter((event) => event.direction === "BULLISH").length;
    const bearish = input.advanced.sweeps.filter((event) => event.direction === "BEARISH").length + input.advanced.displacements.filter((event) => event.direction === "BEARISH").length;
    const value = bullish === bearish ? 50 : bullish > bearish ? 70 : 30;
    contributors.push({ id: "liquidity", label: "Liquidity and displacement", value, weight: 0.25, explanation: `${bullish} bullish and ${bearish} bearish confirmed events.` });
  }
  if (input.divergences?.status === "AVAILABLE") {
    const latest = input.divergences.divergences.at(-1);
    contributors.push({ id: "divergence", label: "Momentum divergence", value: !latest ? 50 : latest.direction === "BULLISH" ? 70 : 30, weight: 0.15, explanation: latest ? `${latest.direction} ${latest.indicator} divergence confirmed.` : "No confirmed divergence." });
  }
  if (input.crossAsset?.status === "AVAILABLE") contributors.push({ id: "relative", label: "Relative context", value: input.crossAsset.context === "OUTPERFORMING" ? 75 : input.crossAsset.context === "UNDERPERFORMING" ? 25 : 50, weight: 0.2, explanation: `${input.crossAsset.context} versus ${input.crossAsset.benchmark}.` });
  const totalWeight = contributors.reduce((sum, row) => sum + row.weight, 0);
  const score = totalWeight ? Math.round(contributors.reduce((sum, row) => sum + row.value * row.weight, 0) / totalWeight) : 50;
  return { status: contributors.length >= 3 ? "AVAILABLE" : "PARTIAL", score, label: score >= 67 ? "HIGH" : score >= 40 ? "MODERATE" : "LOW", contributors, disclosure: "DESCRIPTIVE_NOT_PROBABILITY", modelVersion: "technical-confluence-v4.0.0" };
}
