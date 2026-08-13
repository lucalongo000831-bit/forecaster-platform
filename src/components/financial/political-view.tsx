"use client";

import type { PoliticalIntelligenceReport } from "@/types";
import { PoliticalCompanyIntelligenceView } from "./political-company-intelligence-view";

/** Compatibility entry point. All asset Political views use the V3 report. */
export function PoliticalView({ data }: { data: PoliticalIntelligenceReport }) {
  return <PoliticalCompanyIntelligenceView initialReport={data}/>;
}
