import { GlobalMarketsView } from "@/components/financial/global-markets-view";
import { editorialBriefProvider } from "@/services/editorial";
import { getGlobalRiskCurrent, getGlobalRiskHistory } from "@/services/global-risk";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 60;
export default async function GlobalMarketsPage() { const renderedAt = new Date().getTime(); const [snapshot, history, brief] = await Promise.all([getGlobalRiskCurrent(), getGlobalRiskHistory("1M"), editorialBriefProvider.getCurrent().catch(() => null)]); return <GlobalMarketsView snapshot={snapshot} history={history} brief={brief} renderedAt={renderedAt}/>; }
