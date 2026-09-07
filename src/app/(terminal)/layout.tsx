import { AppShell } from "@/components/shell/app-shell";
import { KairoChatProvider } from "@/components/ai/kairo-chat-provider";
import { financialDataService } from "@/services";
import { getServerEnvironment } from "@/schemas/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function TerminalLayout({ children }: { children: React.ReactNode }) {
  const shellData = await financialDataService.getShellData();
  const aiEnabled = getServerEnvironment().ENABLE_KAIRO_AI;
  return <KairoChatProvider enabled={aiEnabled}><AppShell data={shellData}>{children}</AppShell></KairoChatProvider>;
}
