import { InstrumentShell } from "@/components/instrument/instrument-shell";
import { financialDataService } from "@/services";

export default async function InstrumentLayout({ children, params }: { children: React.ReactNode; params: Promise<{ market: string; symbol: string }> }) {
  const ref = await params;
  const instrument = await financialDataService.getInstrument(ref);
  return <InstrumentShell instrument={instrument}>{children}</InstrumentShell>;
}
