import type { InstrumentKind } from "@/types";

// Canonical, direct market instruments. This list only classifies the wrapper;
// it never propagates issuer or holding activity into an ETF.
const verifiedEtfSymbols = new Set([
  "SPY", "QQQ", "DIA", "IWM", "IVV", "VOO", "VTI", "VEA", "VWO", "EFA", "EEM",
  "XLK", "XLF", "XLE", "XLV", "XLI", "XLY", "XLP", "XLU", "XLB", "XLRE", "XLC",
  "TLT", "IEF", "SHY", "LQD", "HYG", "GIGB", "MBB", "JMBS", "CMBS", "GLD", "SLV", "USO", "IBIT", "BITB",
]);

export function verifiedInstrumentKind(symbolInput: string, reportedType?: string | null, name?: string | null): InstrumentKind | null {
  const symbol = symbolInput.toUpperCase();
  const type = reportedType?.toUpperCase() ?? "";
  if (symbol.endsWith("-USD") || type.includes("CRYPTO")) return "CRYPTO";
  if (symbol.startsWith("^") || type === "INDEX") return "INDEX";
  if (verifiedEtfSymbols.has(symbol) || type.includes("ETF") || /\bETF\b|\bEXCHANGE[- ]TRADED FUND\b|\bSPDR\b|\bISHARES\b/i.test(name ?? "")) return "ETF";
  if (type.includes("FUND")) return "FUND";
  if (symbol.includes("=X")) return "FOREX";
  return null;
}
