import { ForecastDashboard } from "@/components/financial/forecast-dashboard";
import { Footer } from "@/components/shell/footer";
import { getForecastAnalysis } from "@/services/analysis/forecast-service";

export default async function ForecastPage({ params }: { params: Promise<{ market: string; symbol: string }> }) {
  const { symbol } = await params;
  const initial = await getForecastAnalysis(symbol, "1m").then((result) => result.analysis).catch(() => null);
  return <><ForecastDashboard symbol={symbol.toUpperCase()} initial={initial}/><Footer/></>;
}
