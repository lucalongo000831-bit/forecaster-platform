import { SeasonalityExplorer } from "@/components/financial/seasonality-explorer";
import { DataUnavailable } from "@/components/financial/data-state";
import { Footer } from "@/components/shell/footer";
import { getSeasonalityAnalysis } from "@/services/analysis/seasonality-service";

export default async function SeasonalityPage({ params }: { params: Promise<{ market: string; symbol: string }> }) {
  const ref = await params;
  const data = await getSeasonalityAnalysis(ref.symbol).catch(() => null);
  if (!data) return <><div className="container-shell page-stack"><DataUnavailable title="Seasonality data unavailable" detail="No validated historical snapshot is available and the configured market-data providers did not return sufficient daily OHLC history."/></div><Footer/></>;
  return <><SeasonalityExplorer symbol={data.symbol} initial={data}/><Footer/></>;
}
