import { notFound } from "next/navigation";
import { PoliticianActivityView } from "@/components/financial/politician-activity-view";
import { getPoliticianActivity } from "@/services/political";

export const dynamic = "force-dynamic";

export default async function PoliticianPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; const report = await getPoliticianActivity(decodeURIComponent(id), "1Y"); if (!report) notFound(); return <PoliticianActivityView report={report}/>; }
