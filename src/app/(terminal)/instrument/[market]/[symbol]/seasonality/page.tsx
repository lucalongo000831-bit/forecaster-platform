import { SeasonalityExplorerLoader } from "@/components/financial/seasonality-explorer-loader";
import { Footer } from "@/components/shell/footer";

export default async function SeasonalityPage({ params }: { params: Promise<{ market: string; symbol: string }> }) {
  const ref = await params;
  return <><SeasonalityExplorerLoader symbol={decodeURIComponent(ref.symbol)}/><Footer/></>;
}
