import { PoliticalView } from "@/components/financial/political-view";
import { financialDataService } from "@/services";

export default async function PoliticalPage({ params }: { params: Promise<{ market: string; symbol: string }> }) {
  const data = await financialDataService.getPoliticalActivity(await params);
  return <PoliticalView data={data}/>;
}
