import type { KairoPageContext } from "./types";

export function requiredToolForMessage(message: string, context: KairoPageContext): string | null {
  const normalized = message.toLocaleLowerCase("it-IT");
  if (!context.symbol) return /\b(analizza|analisi)\b/.test(normalized) ? "search_instrument" : null;
  if (context.assetType === "crypto" || /\b(crypto|bitcoin|ethereum|btc|eth)\b/.test(normalized)) return "get_crypto_intelligence";
  if (/\b(politic|congress|senator|deputat|parlament)\w*/.test(normalized)) return "get_political_trades";
  if (/\b(earning|trimestral|risultati)\w*/.test(normalized)) return "get_earnings";
  if (/\b(fair value|valutazion|dcf|prezzo.*entr|prezzo.*interessant|margin of safety)\b/.test(normalized)) return "get_company_intelligence";
  if (/\b(analizza|analisi|thesis|tesi)\b/.test(normalized)) return "get_company_intelligence";
  return null;
}
