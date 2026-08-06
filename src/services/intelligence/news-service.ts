import "server-only";

import { analyzeNewsIntelligence } from "@/engines/news";
import { financialProviderRouter } from "@/providers";
import { normalizeSymbol } from "@/services/yahoo/symbol-resolver";
import { persistNewsIntelligence } from "./news-repository";

export async function getNewsIntelligence(symbolInput: string, limit = 30) {
  const symbol = normalizeSymbol(decodeURIComponent(symbolInput));
  const result = await financialProviderRouter.news(symbol, limit);
  const analysis = analyzeNewsIntelligence({ symbol, provider: result.meta.provider, items: result.data });
  const persisted = await persistNewsIntelligence(analysis);
  return { analysis: { ...analysis, persisted }, meta: result.meta };
}
