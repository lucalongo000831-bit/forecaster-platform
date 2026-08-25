import { Check, Info } from "lucide-react";
import {
  FinancialHighlightsCharts,
  GroupedFinancialChart,
  RevenueMixCharts,
  ScoreChart,
} from "@/components/charts/market-charts";
import { SharesChart } from "@/components/charts/lightweight/lightweight-financial-charts";
import { PeriodToggle } from "@/components/ui/interactive-controls";
import { formatNumber } from "@/lib";
import type { FundamentalsData, SummaryMetric } from "@/types";
import { DataUnavailable } from "./data-state";

export function SummaryPanel({ columns }: { columns: SummaryMetric[][] }) {
  return <div className="grid-2 rounded-2xl bg-[var(--navy)] p-6 text-white">{columns.map((group, index) => <dl className="grid grid-cols-2 gap-x-5 gap-y-3" key={index}>{group.map(({ label, value }) => <div className="contents" key={label}><dt>{label}</dt><dd className="font-bold text-blue-300">{value}</dd></div>)}</dl>)}</div>;
}

export function FinancialHighlights({ data }: { data: FundamentalsData["financials"] }) {
  if (!data.length) return <section><div className="section-row"><span className="section-pill">Financial Highlights</span></div><DataUnavailable detail="Historical financial statements are unavailable for this instrument or provider plan."/></section>;
  return <section><div className="section-row"><span className="section-pill">Financial Highlights</span><PeriodToggle/></div><FinancialHighlightsCharts data={data}/></section>;
}

export function FairValueSection({ data, currentPrice }: { data: FundamentalsData; currentPrice: number }) {
  if (!data.fairValues.length) return <section><div className="section-row"><span className="section-pill">Fair Value Calculations</span></div><DataUnavailable detail="A validated valuation model is not available yet; no fair value is synthesized."/></section>;
  return <section><div className="section-row"><span className="section-pill">Fair Value Calculations</span></div><div className="grid gap-6 lg:grid-cols-[1fr_1fr]"><div className="grid-2">{data.fairValues.map(({ label, value }) => <div className="card p-5" key={label}><div className="flex items-start justify-between"><div><strong className="muted">{label} <Info className="inline text-blue-400" size={15}/></strong><div className="kpi mt-2">{value.toFixed(2)}</div></div><span className="grid h-10 w-10 place-items-center rounded-full bg-blue-400 text-white"><Check/></span></div></div>)}</div><div className="soft-card grid place-items-center p-7 text-center"><div><div className="mx-auto max-w-56 rounded-xl bg-green-200 p-4"><strong>Average Fair Value</strong><div className="text-4xl font-bold">{data.averageFairValue.toFixed(2)}</div></div><p className="mt-5 text-xl">Current price {currentPrice.toFixed(2)} is <strong>{data.fairValueUpsidePercent.toFixed(2)}% below</strong> the Fair Value.</p></div></div></div></section>;
}

export function SoliditySection({ scoreSeries, score }: { scoreSeries: FundamentalsData["scoreSeries"]; score: number }) {
  if (!scoreSeries.length) return <section><div className="section-row"><span className="section-pill">Fundamental quality</span></div><DataUnavailable detail="The available statements are insufficient for a defensible fundamental score."/></section>;
  return <section><div className="section-row"><span className="section-pill">Fundamental quality</span><nav className="segmented"><button className="active">Composite</button><button>Completeness</button><button>Quality</button></nav></div><div className="grid-2 items-center"><ScoreChart data={scoreSeries}/><div className="soft-card p-8 text-center"><div className="mx-auto max-w-56 rounded-xl bg-green-200 p-4"><span>Fundamental Score</span><div className="text-4xl font-bold">{score.toFixed(1)}</div></div><p className="mt-5 text-xl">Versioned composite of the available growth, profitability, balance-sheet, cash-flow, valuation and quality metrics.</p></div></div></section>;
}

export function ValueGenerationSection({ data }: { data: FundamentalsData }) {
  if (!data.valueSignals.length) return <section><div className="section-row"><span className="section-pill">Value Generation</span></div><DataUnavailable detail="A robust historical share-count and weighted-financial series is not available for this symbol."/></section>;
  return <section><div className="section-row"><span className="section-pill">Value Generation</span><PeriodToggle/></div><div className="grid-2"><div><span className="badge bg-[var(--navy)] text-white">Shares Outstanding</span><SharesChart data={data.sharesSeries}/></div><div><span className="badge bg-[var(--navy)] text-white">Weighted Financials</span><GroupedFinancialChart data={data.financials}/></div></div><div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1fr_1fr_2fr]">{data.valueSignals.map(({ label, value }) => <div className="card bg-green-50 p-5 text-center" key={label}><span>{label}</span><strong className="mt-2 block text-lg">{value}</strong></div>)}<div className="soft-card p-6 text-center"><div className="mx-auto max-w-52 rounded-xl bg-green-200 p-3"><span>Model assessment</span><div className="text-3xl font-bold">{data.solidityScore >= 65 ? "Constructive" : data.solidityScore >= 40 ? "Balanced" : "Cautious"}</div></div><p className="mt-3 text-lg">The assessment uses only available normalized fields and is not an investment recommendation.</p></div></div></section>;
}

export function RevenueSection({ data }: { data: FundamentalsData }) {
  if (!data.products.length) return <section><div className="section-row"><span className="section-pill">Revenue by Products</span></div><DataUnavailable detail="Standardized product-segment revenue is not available from the configured provider plan."/></section>;
  return <section><div className="section-row"><span className="section-pill">Revenue by Products</span></div><RevenueMixCharts products={data.products} byYear={data.revenueByYear}/><p className="sr-only">Total product revenue {formatNumber(data.products.reduce((sum, item) => sum + item.value, 0))}</p></section>;
}
