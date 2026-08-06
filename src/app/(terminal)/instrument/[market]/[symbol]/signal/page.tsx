import { SignalDashboard } from "@/components/financial/signal-dashboard";
import { Footer } from "@/components/shell/footer";
import { getSignalAnalysis } from "@/services/analysis/signal-service";

export default async function SignalPage({ params }: { params: Promise<{ market: string; symbol: string }> }) {
  const { symbol } = await params;
  const initial = await getSignalAnalysis(symbol, "1m").then((result) => result.analysis).catch(() => null);
  return <><SignalDashboard symbol={symbol.toUpperCase()} initial={initial}/><Footer/></>;
}
