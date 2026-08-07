import { CompanyIntelligenceView } from "@/components/financial/company-intelligence-view";
import { Footer } from "@/components/shell/footer";
import { getCompanyIntelligence } from "@/services/company";

export default async function CompanyAnalysisPage({ params }: { params: Promise<{ market: string; symbol: string }> }) {
  const { symbol } = await params;
  const report = await getCompanyIntelligence(symbol);
  return <><CompanyIntelligenceView report={report}/><Footer/></>;
}
