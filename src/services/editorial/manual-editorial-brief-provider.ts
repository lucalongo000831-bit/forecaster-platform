import "server-only";

import type { EditorialBriefProvider, GlobalMarketBriefInput } from "@/types";
import { archiveGlobalMarketBriefVersion, createGlobalMarketBriefVersion, getCurrentGlobalMarketBrief, listGlobalMarketBriefs } from "./global-market-brief-repository";

export class ManualEditorialBriefProvider implements EditorialBriefProvider {
  getCurrent() { return getCurrentGlobalMarketBrief(); }
  getHistory(options?: { includeDrafts?: boolean; limit?: number }) { return listGlobalMarketBriefs(options?.includeDrafts, options?.limit); }
  saveDraft(input: GlobalMarketBriefInput, userId: string) { return createGlobalMarketBriefVersion(input, userId, "DRAFT"); }
  publish(input: GlobalMarketBriefInput, userId: string) { return createGlobalMarketBriefVersion(input, userId, "PUBLISHED"); }
  archive(versionId: string, userId: string) { void userId; return archiveGlobalMarketBriefVersion(versionId); }
}

export const editorialBriefProvider: EditorialBriefProvider = new ManualEditorialBriefProvider();

// Future placeholder: a KairoAIEditorialBriefProvider can implement the same
// interface when explicitly enabled. No OpenAI code is invoked by this module.
