import { createCompanyGetHandler } from "@/services/company/company-api";
export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 30; export const GET = createCompanyGetHandler("scenarios");
