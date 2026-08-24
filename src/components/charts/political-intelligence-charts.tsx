"use client";

import { useMemo } from "react";
import { Area, Bar, CartesianGrid, ComposedChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MarketChartPoint, PoliticalTimelinePoint, PoliticalTransaction } from "@/types";
import { kairoChartTheme, kairoRechartsTheme } from "./chart-theme";
import { adaptTimePoints, normalizeChartTime, timeKey } from "./lightweight/chart-data-adapter";
import type { KairoChartMarker, KairoChartSeriesDefinition } from "./lightweight/chart-types";
import { KairoTimeSeriesChart } from "./lightweight/kairo-time-series-chart";

function side(row: PoliticalTransaction) { return row.transactionType === "PURCHASE" ? "PURCHASE" : row.transactionType.startsWith("SALE") ? "SALE" : "OTHER"; }

export function PoliticalPriceDisclosureChart({ prices, transactions }: { prices: MarketChartPoint[]; transactions: PoliticalTransaction[] }) {
  const prepared = useMemo(() => {
    const ordered = [...prices].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
    const nearestTradingDate = (date: string) => ordered.find((point) => point.timestamp.slice(0, 10) >= date)?.timestamp.slice(0, 10) ?? ordered.at(-1)?.timestamp.slice(0, 10) ?? date;
    const metadata = new Map<string, string[]>();
    const markerGroups = new Map<string, { time: NonNullable<ReturnType<typeof normalizeChartTime>>; position: "aboveBar" | "belowBar"; shape: "arrowUp" | "arrowDown"; color: string; labels: Set<string>; details: string[] }>();
    transactions.flatMap((row) => ([
      { date: nearestTradingDate(row.transactionDate), label: "T", phase: "transaction", row },
      { date: nearestTradingDate(row.disclosureDate), label: "D", phase: "disclosure", row },
    ])).forEach((item) => {
      const time = normalizeChartTime(item.date);
      if (time === null) return;
      const transactionSide = side(item.row);
      const color = transactionSide === "PURCHASE" ? kairoChartTheme.bullish : transactionSide === "SALE" ? kairoChartTheme.bearish : kairoChartTheme.textSecondary;
      const position = transactionSide === "PURCHASE" ? "belowBar" : "aboveBar";
      const detail = `${item.label} ${item.row.politicianName} · ${item.row.transactionType.toLowerCase()} · ${item.row.amountRangeRaw ?? "amount not reported"} · ${item.phase} ${item.date}`;
      metadata.set(timeKey(time), [...(metadata.get(timeKey(time)) ?? []), detail]);
      const key = `${timeKey(time)}:${position}`;
      const current = markerGroups.get(key) ?? { time, position, shape: transactionSide === "PURCHASE" ? "arrowUp" : "arrowDown", color, labels: new Set<string>(), details: [] };
      current.labels.add(item.label);
      current.details.push(detail);
      markerGroups.set(key, current);
    });
    const markers: KairoChartMarker[] = [...markerGroups.values()].map((group) => ({
      time: group.time,
      position: group.position,
      shape: group.shape,
      color: group.color,
      text: `${[...group.labels].sort().join("/")}${group.details.length > 1 ? ` ×${group.details.length}` : ""}`,
    })).sort((left, right) => timeKey(left.time).localeCompare(timeKey(right.time)));
    const points = adaptTimePoints(ordered.map((point) => ({ timestamp: point.timestamp, label: point.timestamp.slice(0, 10), value: point.close, metadata: metadata.get(timeKey(normalizeChartTime(point.timestamp.slice(0, 10)) ?? point.timestamp.slice(0, 10)))?.join(" | ") }))).data;
    const series: KairoChartSeriesDefinition[] = [{ id: "price", label: "Price", type: "area", data: points, color: kairoChartTheme.primary, format: "price", lineWidth: 3, markers }];
    return { series, first: points[0]?.label, last: points.at(-1)?.label };
  }, [prices, transactions]);
  return <KairoTimeSeriesChart ariaLabel="Price history with political transaction and public disclosure markers" chartKey={`political-price:${prepared.first}:${prepared.last}:${prices.length}:${transactions.length}`} height={390} series={prepared.series}/>;
}

export function PoliticalTimelineChart({ data }: { data: PoliticalTimelinePoint[] }) {
  return <div className="h-[320px] w-full"><ResponsiveContainer><ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}><defs><linearGradient id="politicalActivityFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={kairoChartTheme.primary} stopOpacity={.22}/><stop offset="1" stopColor={kairoChartTheme.primary} stopOpacity={.02}/></linearGradient></defs><CartesianGrid vertical={false} stroke={kairoRechartsTheme.grid}/><XAxis dataKey="date" minTickGap={35} tick={kairoRechartsTheme.axis}/><YAxis yAxisId="count" allowDecimals={false} tick={kairoRechartsTheme.axis}/><YAxis yAxisId="amount" orientation="right" hide/><Tooltip contentStyle={kairoRechartsTheme.tooltip}/><Legend/><Area yAxisId="amount" dataKey="estimatedActivity" name="Estimated disclosed activity" stroke={kairoChartTheme.primary} fill="url(#politicalActivityFill)"/><Bar yAxisId="count" dataKey="purchases" name="Purchase disclosures" fill={kairoChartTheme.bullish} radius={[4,4,0,0]}/><Bar yAxisId="count" dataKey="sales" name="Sale disclosures" fill={kairoChartTheme.bearish} radius={[4,4,0,0]}/></ComposedChart></ResponsiveContainer></div>;
}
