import { NewsView } from "@/components/financial/news-view";
import { financialDataService } from "@/services";

export default async function NewsPage({ params }: { params: Promise<{ market: string; symbol: string }> }) {
  const data = await financialDataService.getNews(await params);
  return <NewsView data={data}/>;
}
