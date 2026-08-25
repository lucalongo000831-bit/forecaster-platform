import { TechnicalChartWorkspace } from "@/components/financial/technical-chart-workspace";
import { Footer } from "@/components/shell/footer";

export default async function TechnicalChartPage({ params }: { params: Promise<{ market: string; symbol: string }> }) {
  const { symbol } = await params;
  return <><TechnicalChartWorkspace symbol={decodeURIComponent(symbol)}/><Footer/></>;
}
