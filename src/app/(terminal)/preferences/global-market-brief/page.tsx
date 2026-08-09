import { redirect } from "next/navigation";
import { GlobalMarketBriefEditor } from "@/components/financial/global-market-brief-editor";
import { getCurrentUser } from "@/lib/server/auth";
import { editorialBriefProvider } from "@/services/editorial";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export default async function GlobalMarketBriefAdminPage() { const user = await getCurrentUser().catch(() => null); if (!user) redirect("/login?next=/preferences/global-market-brief"); const history = await editorialBriefProvider.getHistory({ includeDrafts: true, limit: 50 }).catch(() => []); return <GlobalMarketBriefEditor initialHistory={history}/>; }
