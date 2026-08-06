import { FundamentalsTabs } from "@/components/instrument/instrument-shell";
import { TranscriptsView } from "@/components/financial/transcripts-view";
import { financialDataService } from "@/services";

export default async function TranscriptsPage({ params }: { params: Promise<{ market: string; symbol: string }> }) {
  const ref = await params;
  const [data, instrument] = await Promise.all([financialDataService.getFundamentals(ref), financialDataService.getInstrument(ref)]);
  return <div className="container-shell page-stack"><FundamentalsTabs instrument={instrument}/><TranscriptsView transcripts={data.transcripts}/></div>;
}
