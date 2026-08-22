import { PatternExplorerLoader } from "@/components/financial/pattern-explorer-loader";
import { Footer } from "@/components/shell/footer";

export default async function PatternPage({ params }: { params: Promise<{ market: string; symbol: string }> }) {
  const ref = await params;
  return <><PatternExplorerLoader symbol={decodeURIComponent(ref.symbol)}/><Footer/></>;
}
