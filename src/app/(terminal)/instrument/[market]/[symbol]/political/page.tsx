import { PoliticalCompanyIntelligenceView } from "@/components/financial/political-company-intelligence-view";
import { getSymbolPoliticalIntelligence } from "@/services/political";

export default async function PoliticalPage({ params }: { params: Promise<{ market: string; symbol: string }> }) {
  const { symbol } = await params;
  const report = await getSymbolPoliticalIntelligence(symbol, { period: "90D", page: 1, pageSize: 20 });
  return <PoliticalCompanyIntelligenceView initialReport={report}/>;
}
