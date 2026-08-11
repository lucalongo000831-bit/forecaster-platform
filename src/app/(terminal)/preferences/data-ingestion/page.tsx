import { redirect } from "next/navigation";
import { DataIngestionAdmin } from "@/components/financial/data-ingestion-admin";
import { getCurrentUser } from "@/lib/server/auth";
import { getDataArchitectureHealth } from "@/services/data-v2";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export default async function DataIngestionPage() { const user = await getCurrentUser().catch(() => null); if (!user) redirect("/login?next=/preferences/data-ingestion"); if (user.role !== "ADMIN") redirect("/settings"); return <DataIngestionAdmin initial={await getDataArchitectureHealth()}/>; }
