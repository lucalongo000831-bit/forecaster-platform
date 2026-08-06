import { SeasonalityExplorer } from "@/components/financial/seasonality-explorer";
import { Footer } from "@/components/shell/footer";
import { financialDataService } from "@/services";

export default async function SeasonalityPage({ params }: { params: Promise<{ market: string; symbol: string }> }) {
  const ref = await params;
  const data = await financialDataService.getSeasonality(ref);
  return <><SeasonalityExplorer symbol={ref.symbol.toUpperCase()} initial={data}/><Footer/></>;
}
