import { TargetRiskDashboard } from "@/components/financial/target-risk-dashboard";
import { Footer } from "@/components/shell/footer";
import { getTargetAnalysis } from "@/services/analysis/target-service";

export default async function TargetsPage({ params }: { params: Promise<{ market: string; symbol: string }> }) {
  const { symbol } = await params;
  const initial = await getTargetAnalysis(symbol, "12m").then((result) => result.analysis).catch(() => null);
  return <><TargetRiskDashboard symbol={symbol.toUpperCase()} initial={initial}/><Footer/></>;
}
