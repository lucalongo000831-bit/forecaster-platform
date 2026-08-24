export const kairoChartTheme = {
  background: "#ffffff",
  surface: "#f8fafc",
  grid: "#e7ebf2",
  textPrimary: "#172033",
  textSecondary: "#738096",
  axis: "#cfd7e3",
  crosshair: "#8190a8",
  bullish: "#18a879",
  bearish: "#e05e72",
  primary: "#5267e8",
  secondary: "#253a5c",
  comparison: "#20a4a8",
  benchmark: "#18a879",
  averageLong: "#18a879",
  averageShort: "#e05e72",
  bestMatch: "#626ee8",
  selectedEvent: "#f4a525",
  volume: "rgba(82, 103, 232, 0.28)",
  referenceLine: "#253a5c",
} as const;

export const kairoRechartsTheme = {
  axis: { fontSize: 11, fill: kairoChartTheme.textSecondary },
  grid: kairoChartTheme.grid,
  cursor: "rgba(82, 103, 232, 0.06)",
  tooltip: {
    backgroundColor: "rgba(255,255,255,.97)",
    border: `1px solid ${kairoChartTheme.grid}`,
    borderRadius: 14,
    boxShadow: "0 16px 40px rgba(23,32,51,.12)",
    color: kairoChartTheme.textPrimary,
    fontSize: 12,
  },
} as const;

export function chartCssVariables() {
  return {
    "--chart-background": kairoChartTheme.background,
    "--chart-grid": kairoChartTheme.grid,
    "--chart-text-primary": kairoChartTheme.textPrimary,
    "--chart-text-secondary": kairoChartTheme.textSecondary,
    "--chart-axis": kairoChartTheme.axis,
    "--chart-crosshair": kairoChartTheme.crosshair,
    "--chart-bullish": kairoChartTheme.bullish,
    "--chart-bearish": kairoChartTheme.bearish,
    "--chart-primary": kairoChartTheme.primary,
    "--chart-comparison": kairoChartTheme.comparison,
    "--chart-volume": kairoChartTheme.volume,
  } as CSSProperties;
}
import type { CSSProperties } from "react";
