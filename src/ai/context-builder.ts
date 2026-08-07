import "server-only";

import { normalizeSymbol } from "@/services/yahoo/symbol-resolver";
import type { AnalysisContext, KairoPageContext } from "./types";

export function normalizePageContext(input: KairoPageContext): KairoPageContext {
  return {
    symbol: input.symbol ? normalizeSymbol(decodeURIComponent(input.symbol)) : undefined,
    market: input.market?.trim().toUpperCase(),
    assetType: input.assetType,
    currentPage: input.currentPage?.trim().slice(0, 100),
  };
}

export function createAnalysisContext(input: KairoPageContext): AnalysisContext {
  return { ...normalizePageContext(input), sources: [], timestamps: {} };
}

export function pageContextInstruction(context: KairoPageContext): string {
  if (!context.symbol) return "Non è selezionato alcuno strumento. Risolvi l'asset con search_instrument prima di richiedere dati.";
  return `Contesto pagina attuale: symbol=${context.symbol}; market=${context.market ?? "UNKNOWN"}; assetType=${context.assetType ?? "unknown"}; currentPage=${context.currentPage ?? "unknown"}. I follow-up senza simbolo si riferiscono a questo asset.`;
}
