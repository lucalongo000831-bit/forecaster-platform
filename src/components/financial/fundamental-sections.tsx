import { Check, Info } from "lucide-react";
import {
  FinancialHighlightsCharts,
  GroupedFinancialChart,
  RevenueMixCharts,
  ScoreChart,
  SharesChart,
} from "@/components/charts/market-charts";
import { PeriodToggle } from "@/components/ui/interactive-controls";
import { formatNumber } from "@/lib";
import type { FundamentalsData, SummaryMetric } from "@/types";
import { DataUnavailable } from "./data-state";

export function SummaryPanel({ columns }: { columns: SummaryMetric[][] }) {
  return <div className="grid-2 rounded-2xl bg-[var(--navy)] p-6 text-white">{columns.map((group, index) => <dl className="grid grid-cols-2 gap-x-5 gap-y-3" key={index}>{group.map(({ label, value }) => <div className="contents" key={label}><dt>{label}</dt><dd className="font-bold text-blue-300">{value}</dd></div>)}</dl>)}</div>;
}

export function FinancialHighlights({ data }: { data: FundamentalsData["financials"] }) {
  return <section><div className="section-row"><span className="section-pill">Financial Highlights</span><PeriodToggle/></div><FinancialHighlightsCharts data={data}/></section>;
}

export function FairValueSection({ data, currentPrice }: { data: FundamentalsData; currentPrice: number }) {
  if (!data.fairValues.length) return <section><div className="section-row"><span className="section-pill">Fair Value Calculations</span></div><DataUnavailable detail="Yahoo Finance does not provide the proprietary fair-value models used by this interface; no value is synthesized."/></section>;
  return <section><div className="section-row"><span className="section-pill">Fair Value Calculations</span></div><div className="grid gap-6 lg:grid-cols-[1fr_1fr]"><div className="grid-2">{data.fairValues.map(({ label, value }) => <div className="card p-5" key={label}><div className="flex items-start justify-between"><div><strong className="muted">{label} <Info className="inline text-blue-400" size={15}/></strong><div className="kpi mt-2">{value.toFixed(2)}</div></div><span className="grid h-10 w-10 place-items-center rounded-full bg-blue-400 text-white"><Check/></span></div></div>)}</div><div className="soft-card grid place-items-center p-7 text-center"><div><div className="mx-auto max-w-56 rounded-xl bg-green-200 p-4"><strong>Average Fair Value</strong><div className="text-4xl font-bold">{data.averageFairValue.toFixed(2)}</div></div><p className="mt-5 text-xl">Current price {currentPrice.toFixed(2)} is <strong>{data.fairValueUpsidePercent.toFixed(2)}% below</strong> the Fair Value.</p></div></div></div></section>;
}

export function SoliditySection({ scoreSeries, score }: { scoreSeries: FundamentalsData["scoreSeries"]; score: number }) {
  if (!scoreSeries.length) return <section><div className="section-row"><span className="section-pill">Solidity</span></div><DataUnavailable detail="Altman, Piotroski and Beneish scores require statement fields that are not consistently available from Yahoo Finance."/></section>;
  return <section><div className="section-row"><span className="section-pill">Solidity</span><nav className="segmented"><button className="active">Altman Z-Score</button><button>Piotroski F-Score</button><button>Beneish M-Score</button></nav></div><div className="grid-2 items-center"><ScoreChart data={scoreSeries}/><div className="soft-card p-8 text-center"><div className="mx-auto max-w-56 rounded-xl bg-green-200 p-4"><span>Altman Z-Score</span><div className="text-4xl font-bold">{score.toFixed(2)}</div></div><p className="mt-5 text-2xl"><strong>Low</strong> risk of bankruptcy.</p></div></div></section>;
}

export function ValueGenerationSection({ data }: { data: FundamentalsData }) {
  if (!data.valueSignals.length) return <section><div className="section-row"><span className="section-pill">Value Generation</span></div><DataUnavailable detail="A robust historical share-count and weighted-financial series is not available for this symbol."/></section>;
  return <section><div className="section-row"><span className="section-pill">Value Generation</span><PeriodToggle/></div><div className="grid-2"><div><span className="badge bg-[var(--navy)] text-white">Shares Outstanding</span><SharesChart data={data.sharesSeries}/></div><div><span className="badge bg-[var(--navy)] text-white">Weighted Financials</span><GroupedFinancialChart data={data.financials}/></div></div><div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1fr_1fr_2fr]">{data.valueSignals.map(({ label, value }) => <div className="card bg-green-50 p-5 text-center" key={label}><span>{label}</span><strong className="mt-2 block text-2xl">{value}</strong></div>)}<div className="soft-card p-6 text-center"><div className="mx-auto max-w-52 rounded-xl bg-green-200 p-3"><span>This company is</span><div className="text-4xl font-bold">Robust</div></div><p className="mt-3 text-lg">It is <strong>buying back</strong> its shares and <strong>rewarding</strong> investors.</p></div></div></section>;
}

export function RevenueSection({ data }: { data: FundamentalsData }) {
  if (!data.products.length) return <section><div className="section-row"><span className="section-pill">Revenue by Products</span></div><DataUnavailable detail="Yahoo Finance does not expose standardized product-segment revenue for this component."/></section>;
  return <section><div className="section-row"><span className="section-pill">Revenue by Products</span></div><RevenueMixCharts products={data.products} byYear={data.revenueByYear}/><p className="sr-only">Total product revenue {formatNumber(data.products.reduce((sum, item) => sum + item.value, 0))}</p></section>;
}
