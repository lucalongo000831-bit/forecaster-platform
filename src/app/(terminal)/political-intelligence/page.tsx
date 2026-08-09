import { politicalFiltersSchema } from "@/schemas";
import { PoliticalGlobalIntelligenceView } from "@/components/financial/political-global-intelligence-view";
import { getPoliticalLeaderboard } from "@/services/political";

export const dynamic = "force-dynamic";

export default async function PoliticalIntelligencePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams; const flat = Object.fromEntries(Object.entries(raw).flatMap(([key, value]) => typeof value === "string" ? [[key, value]] : []));
  const parsed = politicalFiltersSchema.safeParse(flat); const filters = parsed.success ? parsed.data : politicalFiltersSchema.parse({});
  const report = await getPoliticalLeaderboard(filters);
  return <PoliticalGlobalIntelligenceView report={report} activeFilters={Object.fromEntries(Object.entries(filters).map(([key, value]) => [key, String(value)]))}/>;
}
