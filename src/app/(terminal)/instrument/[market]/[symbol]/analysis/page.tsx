import { headers } from "next/headers";
import { CompanyIntelligenceView } from "@/components/financial/company-intelligence-view";
import { AssetIntelligenceView } from "@/components/financial/asset-intelligence-view";
import { Footer } from "@/components/shell/footer";
import { requestIpFromHeaders } from "@/lib/server/request-context";
import { getCompanyIntelligence } from "@/services/company";
import { getAssetIntelligence } from "@/services/analysis/asset-intelligence-service";
import { enforceCompanyAnalysisRateLimit } from "@/services/company/company-analysis-access";
import { getSymbolPoliticalIntelligence } from "@/services/political";

export default async function CompanyAnalysisPage({ params }: { params: Promise<{ market: string; symbol: string }> }) {
  const { symbol } = await params;
  await enforceCompanyAnalysisRateLimit(requestIpFromHeaders(await headers()));
  const assetReport = await getAssetIntelligence(symbol);
  if (assetReport) return <><AssetIntelligenceView report={assetReport}/><Footer/></>;
  const [report, political] = await Promise.all([
    getCompanyIntelligence(symbol),
    getSymbolPoliticalIntelligence(symbol, { period: "90D", page: 1, pageSize: 10 }).catch(() => null),
  ]);
  return <><CompanyIntelligenceView report={report} political={political?.summary}/><Footer/></>;
}
