export function formatKairoPrice(value: number, currency?: string) {
  if (!Number.isFinite(value)) return "—";
  const absolute = Math.abs(value);
  const maximumFractionDigits = absolute >= 1 ? 2 : absolute >= 0.01 ? 4 : 6;
  return new Intl.NumberFormat("en-US", {
    style: currency ? "currency" : "decimal",
    currency,
    minimumFractionDigits: absolute >= 1 ? 2 : Math.min(2, maximumFractionDigits),
    maximumFractionDigits,
  }).format(value);
}

export function formatKairoPercent(value: number, input: "percent" | "decimal" = "percent") {
  if (!Number.isFinite(value)) return "—";
  const normalized = input === "decimal" ? value * 100 : value;
  return `${normalized >= 0 ? "+" : ""}${normalized.toFixed(2)}%`;
}

export function formatKairoChartValue(value: number, format: "number" | "price" | "percent" | "volume" = "number", currency?: string) {
  if (format === "price") return formatKairoPrice(value, currency);
  if (format === "percent") return formatKairoPercent(value);
  if (format === "volume") return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(value);
}
