import { AppShell } from "@/components/shell/app-shell";
import { KairoChatProvider } from "@/components/ai/kairo-chat-provider";
import { financialDataService } from "@/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function TerminalLayout({ children }: { children: React.ReactNode }) {
  const shellData = await financialDataService.getShellData();
  return <KairoChatProvider><AppShell data={shellData}>{children}</AppShell></KairoChatProvider>;
}
