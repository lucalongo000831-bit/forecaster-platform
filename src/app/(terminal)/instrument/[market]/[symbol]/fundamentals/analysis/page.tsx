import { FundamentalsTabs } from "@/components/instrument/instrument-shell";
import {
  FairValueSection,
  FinancialHighlights,
  RevenueSection,
  SoliditySection,
  SummaryPanel,
  ValueGenerationSection,
} from "@/components/financial/fundamental-sections";
import { Footer } from "@/components/shell/footer";
import { financialDataService } from "@/services";

export default async function FundamentalsAnalysisPage({ params }: { params: Promise<{ market: string; symbol: string }> }) {
  const ref = await params;
  const [data, instrument] = await Promise.all([financialDataService.getFundamentals(ref), financialDataService.getInstrument(ref)]);
  return <><div className="container-shell page-stack"><SummaryPanel columns={data.summaryColumns}/><FundamentalsTabs instrument={instrument}/><FinancialHighlights data={data.financials}/><FairValueSection data={data} currentPrice={instrument.quote.price}/><SoliditySection scoreSeries={data.scoreSeries} score={data.solidityScore}/><ValueGenerationSection data={data}/><RevenueSection data={data}/></div><Footer/></>;
}
