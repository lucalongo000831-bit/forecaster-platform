"use client";

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line,
  LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type {
  AnnualPerformancePoint,
  FinancialPoint,
  PortfolioPosition,
  RevenueProduct,
  RevenueYear,
  SeasonalityPoint,
  TimePoint,
} from "@/types";

const axis = { fontSize: 12, fill: "#738096" };
const grid = "#e2e7ef";
function chartSummary(label: string, values: Array<number | null | undefined>) { const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value)); return valid.length ? `${label}. ${valid.length} observations. First ${valid[0].toFixed(2)}, last ${valid.at(-1)!.toFixed(2)}, minimum ${Math.min(...valid).toFixed(2)}, maximum ${Math.max(...valid).toFixed(2)}.` : `${label}. Data unavailable.`; }

export function MainPriceChart({ data, referenceValue, compact = false }: { data: TimePoint[]; referenceValue?: number; compact?: boolean }) {
  return <div className={`chart-wrap ${compact ? "chart-short" : "chart-tall"}`} role="img" aria-label={chartSummary("Price chart", data.map((point) => point.value))}>
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 14, right: 18, bottom: 8, left: 4 }}>
        <defs><linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6576ed" stopOpacity={.42}/><stop offset="100%" stopColor="#6576ed" stopOpacity={.04}/></linearGradient></defs>
        <CartesianGrid stroke={grid} strokeDasharray="2 2" />
        <XAxis dataKey="label" tick={axis} minTickGap={50} />
        <YAxis tick={axis} width={46} />
        <Tooltip />
        <Area type="monotone" dataKey="value" stroke="#6576ed" strokeWidth={3} fill="url(#priceFill)" name="Price" />
        <Line type="monotone" dataKey="comparison" stroke="#25b98a" strokeWidth={2} dot={false} name="Net income trend" />
        {referenceValue !== undefined && <ReferenceLine y={referenceValue} stroke="#172033" strokeDasharray="3 3" />}
      </ComposedChart>
    </ResponsiveContainer>
  </div>;
}

export function DrawdownChart({ data }: { data: TimePoint[] }) {
  return <div className="chart-wrap chart-short" role="img" aria-label={chartSummary("Drawdown chart", data.map((point) => point.value))}><ResponsiveContainer width="100%" height="100%"><AreaChart data={data}>
    <defs><linearGradient id="drawFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f33f3d" stopOpacity={.22}/><stop offset="1" stopColor="#f33f3d" stopOpacity={.04}/></linearGradient></defs>
    <CartesianGrid stroke={grid} strokeDasharray="2 2"/><XAxis dataKey="label" tick={axis} minTickGap={70}/><YAxis tick={axis}/><Tooltip/>
    <Area dataKey="value" stroke="#e42724" fill="url(#drawFill)" strokeWidth={2}/>
  </AreaChart></ResponsiveContainer></div>;
}

export function AnnualPerformanceChart({ data }: { data: AnnualPerformancePoint[] }) {
  return <div className="chart-wrap chart-short" role="img" aria-label={chartSummary("Annual performance chart in percent", data.map((point) => point.value))}><ResponsiveContainer width="100%" height="100%"><BarChart data={data}>
    <CartesianGrid stroke={grid} vertical={false}/><XAxis dataKey="year" tick={axis}/><YAxis tick={axis} unit="%"/><Tooltip/>
    <Bar dataKey="value" radius={[5,5,5,5]}>{data.map((item) => <Cell key={item.year} fill={item.value >= 0 ? "#399637" : "#ff3d37"}/>)}</Bar>
  </BarChart></ResponsiveContainer></div>;
}

export function ForecastDistributionChart({ data, currentPrice }: { data: Array<{ label: string; price: number }>; currentPrice: number }) {
  return <div className="chart-wrap chart-short" role="img" aria-label={chartSummary("Forecast percentile distribution", data.map((point) => point.price))}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={data}>
    <CartesianGrid stroke={grid} vertical={false}/><XAxis dataKey="label" tick={axis}/><YAxis tick={axis} domain={["auto", "auto"]}/><Tooltip/>
    <Bar dataKey="price" fill="#6576ed" radius={[6,6,0,0]} name="Forecast percentile"/><ReferenceLine y={currentPrice} stroke="#172033" strokeDasharray="4 4" label="Current"/>
  </ComposedChart></ResponsiveContainer></div>;
}

export function BacktestEquityChart({ equity, benchmark }: { equity: Array<{ timestamp: string; value: number }>; benchmark: Array<{ timestamp: string; value: number }> }) {
  const benchmarkByDate = new Map(benchmark.map((point) => [point.timestamp.slice(0, 10), point.value])); const data = equity.map((point) => ({ label: point.timestamp.slice(0, 10), equity: point.value, benchmark: benchmarkByDate.get(point.timestamp.slice(0, 10)) }));
  return <div className="chart-wrap chart-tall" role="img" aria-label={chartSummary("Backtest equity curve", data.map((point) => point.equity))}><ResponsiveContainer width="100%" height="100%"><LineChart data={data}><CartesianGrid stroke={grid} strokeDasharray="2 2"/><XAxis dataKey="label" tick={axis} minTickGap={80}/><YAxis tick={axis}/><Tooltip/><Legend/><Line dataKey="equity" stroke="#6576ed" strokeWidth={3} dot={false} name="Strategy"/><Line dataKey="benchmark" stroke="#25b98a" strokeWidth={2} dot={false} connectNulls name="Benchmark"/></LineChart></ResponsiveContainer></div>;
}

export function DividendChart({ data }: { data: TimePoint[] }) {
  return <div className="chart-wrap chart-short" role="img" aria-label={chartSummary("Dividend history", data.map((point) => point.value))}><ResponsiveContainer width="100%" height="100%"><BarChart data={data}>
    <CartesianGrid stroke={grid} vertical={false}/><XAxis dataKey="label" tick={axis} minTickGap={70}/><YAxis tick={axis}/><Tooltip/>
    <Bar dataKey="value" fill="#25b98a" radius={[5,5,0,0]}/>
  </BarChart></ResponsiveContainer></div>;
}

export function SeasonalityChart({ data }: { data: SeasonalityPoint[] }) {
  return <div className="chart-wrap chart-tall" role="img" aria-label={chartSummary("Seasonality chart, current year", data.map((point) => point.current))}><ResponsiveContainer width="100%" height="100%"><LineChart data={data}>
    <CartesianGrid stroke={grid} strokeDasharray="2 2"/><XAxis dataKey="week" tickFormatter={(value) => ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][Math.min(11, Math.floor((Number(value)-1)/4))]} tick={axis}/><YAxis hide/><Tooltip/>
    <Legend/><Line dataKey="current" stroke="#e95f75" strokeWidth={3} dot={false} name="Current year"/><Line dataKey="average" stroke="#40d7a5" strokeWidth={3} dot={false} name="20-year average"/><Line dataKey="analogue" stroke="#0c9a70" strokeWidth={3} dot={false} name="Analogue year"/>
    <ReferenceLine x={28} stroke="#087e61" strokeWidth={2} strokeDasharray="4 4"/>
  </LineChart></ResponsiveContainer></div>;
}

export function PatternChart({ data, referenceValue }: { data: TimePoint[]; referenceValue: number }) {
  return <div className="chart-wrap chart-tall" role="img" aria-label={chartSummary("Historical pattern chart", data.map((point) => point.value))}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={data}>
    <defs><linearGradient id="shortFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6576ed" stopOpacity={.38}/><stop offset="1" stopColor="#6576ed" stopOpacity={.06}/></linearGradient></defs>
    <CartesianGrid stroke={grid} strokeDasharray="2 2"/><XAxis dataKey="label" tick={axis} minTickGap={38}/><YAxis tick={axis}/><Tooltip/>
    <Area dataKey="value" stroke="#6576ed" fill="url(#shortFill)" strokeWidth={2} name="Most correlated event"/>
    <Line dataKey="comparison" stroke="#25b98a" strokeWidth={3} connectNulls dot={{r:4}} name="Average long"/>
    <ReferenceLine y={referenceValue} stroke="#172033" strokeDasharray="3 3"/>
  </ComposedChart></ResponsiveContainer></div>;
}

export function AdvancedDpoChart({ data }: { data: TimePoint[] }) {
  return <div className="chart-wrap chart-tall" role="img" aria-label={chartSummary("Detrended price oscillator chart", data.map((point) => point.value))}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={data}>
    <CartesianGrid stroke={grid} strokeDasharray="2 2"/><XAxis dataKey="label" tick={axis} minTickGap={58}/><YAxis yAxisId="left" tick={axis}/><YAxis yAxisId="right" hide/>
    <Tooltip/><Bar yAxisId="right" dataKey="volume" fill="#40d7a5" opacity={.58}/><Line yAxisId="left" dataKey="value" stroke="#6576ed" strokeWidth={3} dot={false}/>
  </ComposedChart></ResponsiveContainer></div>;
}

export function OscillatorChart({ data }: { data: TimePoint[] }) {
  return <div className="chart-wrap" role="img" aria-label={chartSummary("Momentum oscillator chart", data.map((point) => point.value))}><ResponsiveContainer width="100%" height="100%"><LineChart data={data}>
    <CartesianGrid stroke={grid} strokeDasharray="2 2"/><XAxis dataKey="label" tick={axis} minTickGap={60}/><YAxis domain={[-160,160]} tick={axis}/><Tooltip/>
    <ReferenceLine y={100} stroke="#ff2b18" strokeWidth={2}/><ReferenceLine y={50} stroke="#ff2b18"/><ReferenceLine y={0} stroke="#222"/><ReferenceLine y={-50} stroke="#168000"/><ReferenceLine y={-100} stroke="#087100" strokeWidth={2}/>
    <Line dataKey="value" stroke="#303030" strokeWidth={3} dot={false}/>
  </LineChart></ResponsiveContainer></div>;
}

export function FinancialHighlightsCharts({ data }: { data: FinancialPoint[] }) {
  return <div className="grid-2">
    <div><div className="chart-legend"><span><i className="legend-dot bg-blue-500"/>Sales</span><span><i className="legend-dot bg-teal-500"/>Net income</span><span><i className="legend-dot bg-amber-500"/>Free cash flow</span></div><GroupedFinancialChart data={data}/></div>
    <div><div className="chart-legend"><span><i className="legend-dot bg-green-500"/>Profit margin</span><span><i className="legend-dot bg-indigo-500"/>ROE</span><span><i className="legend-dot bg-orange-500"/>Debt/equity</span></div><RatioChart data={data}/></div>
  </div>;
}

export function GroupedFinancialChart({ data }: { data: FinancialPoint[] }) {
  return <div className="chart-wrap chart-short" role="img" aria-label={chartSummary("Revenue, income and cash flow history", data.map((point) => point.sales))}><ResponsiveContainer width="100%" height="100%"><BarChart data={data}>
    <CartesianGrid stroke={grid} vertical={false}/><XAxis dataKey="year" tick={axis}/><YAxis tick={axis}/><Tooltip/>
    <Bar dataKey="sales" fill="#6576ed" radius={[6,6,0,0]}/><Bar dataKey="income" fill="#40d7a5" radius={[6,6,0,0]}/><Bar dataKey="cashFlow" fill="#f2b84b" radius={[6,6,0,0]}/>
  </BarChart></ResponsiveContainer></div>;
}

export function RatioChart({ data }: { data: FinancialPoint[] }) {
  return <div className="chart-wrap chart-short" role="img" aria-label={chartSummary("Profitability and leverage ratios", data.map((point) => point.margin))}><ResponsiveContainer width="100%" height="100%"><BarChart data={data}>
    <CartesianGrid stroke={grid} vertical={false}/><XAxis dataKey="year" tick={axis}/><YAxis tick={axis}/><Tooltip/>
    <Bar dataKey="margin" fill="#20bf61" radius={[6,6,0,0]}/><Bar dataKey="roe" fill="#6d69ec" radius={[6,6,0,0]}/><Bar dataKey="debt" fill="#ff6b1a" radius={[6,6,0,0]}/>
  </BarChart></ResponsiveContainer></div>;
}

export function ScoreChart({ data }: { data: TimePoint[] }) {
  return <div className="chart-wrap chart-short" role="img" aria-label={chartSummary("Fundamental score history", data.map((point) => point.value))}><ResponsiveContainer width="100%" height="100%"><BarChart data={data}>
    <CartesianGrid stroke={grid} vertical={false}/><XAxis dataKey="label" tick={axis}/><YAxis tick={axis}/><Tooltip/><Bar dataKey="value" fill="#399637" radius={[5,5,0,0]}/>
  </BarChart></ResponsiveContainer></div>;
}

export function SharesChart({ data }: { data: TimePoint[] }) {
  return <div className="chart-wrap chart-short" role="img" aria-label={chartSummary("Shares outstanding history", data.map((point) => point.value))}><ResponsiveContainer width="100%" height="100%"><AreaChart data={data}>
    <defs><linearGradient id="sharesFill"><stop offset="0" stopColor="#0b7bb5" stopOpacity={.35}/><stop offset="1" stopColor="#0b7bb5" stopOpacity={.05}/></linearGradient></defs>
    <CartesianGrid stroke={grid}/><XAxis dataKey="label" tick={axis}/><YAxis domain={[24,25.2]} tick={axis}/><Tooltip/><Area dataKey="value" stroke="#0b7bb5" fill="url(#sharesFill)" strokeWidth={3}/>
  </AreaChart></ResponsiveContainer></div>;
}

export function RevenueMixCharts({ products, byYear }: { products: RevenueProduct[]; byYear: RevenueYear[] }) {
  return <div className="grid-2">
    <div className="chart-wrap" role="img" aria-label={chartSummary("Revenue mix history", byYear.map((point) => point.compute))}><ResponsiveContainer width="100%" height="100%"><BarChart data={byYear}><CartesianGrid stroke={grid} vertical={false}/><XAxis dataKey="year" tick={axis}/><YAxis tick={axis}/><Tooltip/><Bar dataKey="compute" fill="#f2b84b"/><Bar dataKey="data" fill="#e95f75"/><Bar dataKey="networking" fill="#6576ed"/><Bar dataKey="gaming" fill="#9c5dd5"/></BarChart></ResponsiveContainer></div>
    <div className="chart-wrap" role="img" aria-label={chartSummary("Current revenue mix", products.map((point) => point.value))}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={products} dataKey="value" nameKey="name" outerRadius="75%" label>{products.map((item)=><Cell key={item.name} fill={item.color}/>)}</Pie><Tooltip/><Legend/></PieChart></ResponsiveContainer></div>
  </div>;
}

export function PoliticalChart({ data }: { data: TimePoint[] }) {
  return <div className="chart-wrap chart-tall" role="img" aria-label={chartSummary("Public policy disclosure overlay", data.map((point) => point.value))}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={data}>
    <defs><linearGradient id="politicalFill"><stop offset="0" stopColor="#6576ed" stopOpacity={.3}/><stop offset="1" stopColor="#6576ed" stopOpacity={.03}/></linearGradient></defs>
    <CartesianGrid stroke={grid} strokeDasharray="2 2"/><XAxis dataKey="label" tick={axis} minTickGap={50}/><YAxis yAxisId="price" tick={axis}/><YAxis yAxisId="trades" hide/><Tooltip/><Legend/>
    <Area yAxisId="price" dataKey="value" stroke="#6576ed" fill="url(#politicalFill)" strokeWidth={3} name="Price"/><Bar yAxisId="trades" dataKey="buy" fill="#40d7a5" name="Buy"/><Bar yAxisId="trades" dataKey="sell" fill="#e95f75" name="Sell"/>
  </ComposedChart></ResponsiveContainer></div>;
}

export function AllocationChart({ positions }: { positions: PortfolioPosition[] }) {
  const data = positions.map(({ symbol, quantity, currentPrice }) => ({ name: symbol, value: quantity * currentPrice }));
  const colors=["#6576ed","#40d7a5","#f2b84b","#172033"];
  return <div className="chart-wrap chart-short" role="img" aria-label={chartSummary("Portfolio allocation", data.map((point) => point.value))}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data} innerRadius="48%" outerRadius="75%" dataKey="value" nameKey="name" label>{data.map((item,index)=><Cell key={item.name} fill={colors[index]}/>)}</Pie><Tooltip/><Legend/></PieChart></ResponsiveContainer></div>;
}

export function MarketGauge({ mood }: { mood: string }) {
  return <div className="relative mx-auto h-[260px] w-full max-w-[460px] overflow-hidden" role="img" aria-label={`Market mood gauge: ${mood}`}>
    <div className="absolute left-1/2 top-7 h-[400px] w-[400px] -translate-x-1/2 rounded-full" style={{background:"conic-gradient(from 270deg, #b6f3ca 0 25%, #b8d7fa 25% 50%, #ffdcdc 50% 75%, transparent 75%)"}} />
    <div className="absolute left-1/2 top-[116px] h-[270px] w-[270px] -translate-x-1/2 rounded-full bg-white" />
    <div className="absolute left-1/2 top-[94px] h-[150px] w-4 origin-bottom -translate-x-1/2 rotate-[38deg] rounded-full bg-[#31405a]" />
    <div className="absolute bottom-1 left-1/2 h-20 w-20 -translate-x-1/2 rounded-full bg-[#31405a]" />
    <strong className="absolute left-1/2 top-14 -translate-x-1/2 text-xl">{mood}</strong>
  </div>;
}
