import { BarChart3, CircleDollarSign, TrendingUp } from "lucide-react";
import { AllocationChart } from "@/components/charts/market-charts";
import { financialDataService } from "@/services";
import { formatCurrency, formatNumber, formatPercent } from "@/lib";

export default async function PortfolioPage() {
  const data = await financialDataService.getPortfolioData();
  const total = data.positions.reduce((sum, position) => sum + position.quantity * position.currentPrice, 0);
  const metrics = [
    ["Market value", formatCurrency(total, "USD", 0), CircleDollarSign, "mint"],
    ["Total return", `+${formatCurrency(data.totalReturn, "USD", 0)}`, TrendingUp, "violet"],
    ["Day change", formatPercent(data.dayChangePercent, true), BarChart3, "amber"],
  ] as const;
  return <div className="container-shell page-stack"><header><span className="page-kicker">Ownership / Allocation</span><h1 className="page-title">Your portfolio.</h1><p className="muted mt-3">A calm view of allocation, value and performance using realistic static positions.</p></header><section className="grid-3">{metrics.map(([label, value, Icon, tone]) => <article className={`metric-card ${tone}`} key={label}><div className="metric-icon"><Icon size={20}/></div><div><span className="small-label">{label}</span><div className="kpi positive mt-4">{value}</div></div></article>)}</section><section className="grid-2 items-stretch"><article className="card p-6"><div className="section-row"><span className="section-pill">Allocation</span></div><AllocationChart positions={data.positions}/></article><article className="table-shell"><table className="data-table !min-w-0"><thead><tr><th>Symbol</th><th>Qty</th><th>Avg.</th><th>Value</th></tr></thead><tbody>{data.positions.map((position) => <tr key={position.symbol}><td><span className="table-symbol">{position.symbol.slice(0, 2)}</span><strong>{position.symbol}</strong></td><td>{formatNumber(position.quantity)}</td><td>{formatCurrency(position.averagePrice)}</td><td className="font-bold">{formatCurrency(position.quantity * position.currentPrice)}</td></tr>)}</tbody></table></article></section></div>;
}
