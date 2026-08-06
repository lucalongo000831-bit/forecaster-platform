const numberFormatter = new Intl.NumberFormat("en-US");

export function formatNumber(value: number, options?: Intl.NumberFormatOptions) {
  return options ? new Intl.NumberFormat("en-US", options).format(value) : numberFormatter.format(value);
}

export function formatCurrency(value: number, currency = "USD", maximumFractionDigits = 2) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits,
  }).format(value);
}

export function formatPercent(value: number, signed = false) {
  const prefix = signed && value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}%`;
}

export function formatCompactNumber(value: number) {
  if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return formatNumber(value);
}
