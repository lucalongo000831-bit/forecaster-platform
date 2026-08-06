import { NewsView } from "@/components/financial/news-view";
import { getNewsIntelligence } from "@/services/intelligence/news-service";

export default async function NewsPage({ params }: { params: Promise<{ market: string; symbol: string }> }) {
  const { symbol } = await params;
  const data = await getNewsIntelligence(symbol).then((result) => result.analysis).catch(() => null);
  return <NewsView data={data}/>;
}
