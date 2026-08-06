import { AppShell } from "@/components/shell/app-shell";
import { financialDataService } from "@/services";

export default async function TerminalLayout({ children }: { children: React.ReactNode }) {
  const shellData = await financialDataService.getShellData();
  return <AppShell data={shellData}>{children}</AppShell>;
}
