import "server-only";

import { getServerEnvironment } from "@/schemas/env";
import type { FieldProvenance, MissingDataReason } from "../types";

export interface EsefFact {
  concept: string;
  value: number | string | null;
  unit: string | null;
  periodEnd: string;
  filingUrl: string;
}

export interface NormalizedEsefFiling {
  lei: string;
  filingDate: string;
  reportingPeriodEnd: string;
  facts: Record<string, number | string | null>;
  provenance: FieldProvenance[];
}

const taxonomyMap: Record<string, string> = {
  Revenue: "revenue", Revenues: "revenue", ProfitLoss: "netIncome", Assets: "totalAssets", Equity: "totalEquity", Liabilities: "totalLiabilities", CashFlowsFromUsedInOperatingActivities: "operatingCashFlow",
};

export class EsefAdapter {
  readonly name = "esef" as const;
  isConfigured() { return getServerEnvironment().ENABLE_ESEF_INGESTION; }

  normalizeOfficialFacts(input: { lei: string; filingDate: string; reportingPeriodEnd: string; facts: EsefFact[] }): NormalizedEsefFiling {
    const facts: Record<string, number | string | null> = {}; const provenance: FieldProvenance[] = [];
    for (const fact of input.facts) {
      const localName = fact.concept.includes(":") ? fact.concept.split(":").at(-1)! : fact.concept;
      const field = taxonomyMap[localName]; if (!field || fact.periodEnd !== input.reportingPeriodEnd) continue;
      facts[field] = fact.value;
      provenance.push({ field, provider: "esef", sourceTimestamp: input.filingDate, fetchedAt: new Date().toISOString(), quality: "verified", unit: fact.unit, formula: null, inputs: [] });
    }
    return { lei: input.lei, filingDate: input.filingDate, reportingPeriodEnd: input.reportingPeriodEnd, facts, provenance };
  }

  unavailableReason(): { reason: MissingDataReason; message: string } {
    return this.isConfigured()
      ? { reason: "IDENTIFIER_UNRESOLVED", message: "Nessun filing ESEF ufficiale è stato risolto per questo issuer." }
      : { reason: "PROVIDER_UNAVAILABLE", message: "L’ingestion ESEF opzionale non è abilitata." };
  }
}

export const esefAdapter = new EsefAdapter();
