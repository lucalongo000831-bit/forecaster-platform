import "server-only";

import { getServerEnvironment } from "@/schemas/env";
import { parse, type DefaultTreeAdapterMap } from "parse5";
import { ProviderError } from "../errors";
import type { FieldProvenance, MissingDataReason } from "../types";

export interface EsefFact {
  concept: string;
  value: number | string | null;
  unit: string | null;
  periodEnd: string;
  filingUrl: string;
  contextId?: string | null;
  decimals?: string | null;
  scale?: number;
}

export interface NormalizedEsefFiling {
  lei: string;
  filingDate: string;
  reportingPeriodEnd: string;
  facts: Record<string, number | string | null>;
  provenance: FieldProvenance[];
}

const taxonomyMap: Record<string, string> = {
  Revenue: "revenue", Revenues: "revenue", RevenueFromContractsWithCustomers: "revenue", CostOfSales: "costOfRevenue", GrossProfit: "grossProfit", ProfitLossFromOperatingActivities: "operatingIncome", ProfitLossBeforeTax: "pretaxIncome", IncomeTaxExpenseContinuingOperations: "taxExpense", ProfitLoss: "netIncome", ProfitLossAttributableToOrdinaryEquityHoldersOfParentEntity: "netIncome", BasicEarningsLossPerShare: "eps", DilutedEarningsLossPerShare: "epsDiluted", WeightedAverageShares: "weightedAverageShsOut", AdjustedWeightedAverageShares: "weightedAverageShsOutDil", NumberOfSharesOutstanding: "sharesOutstanding", CashAndCashEquivalents: "cashAndCashEquivalents", CurrentFinancialAssets: "shortTermInvestments", TradeAndOtherReceivables: "receivables", Inventories: "inventory", CurrentAssets: "totalCurrentAssets", PropertyPlantAndEquipment: "propertyPlantEquipment", Goodwill: "goodwill", IntangibleAssetsOtherThanGoodwill: "intangibleAssets", Assets: "totalAssets", TradeAndOtherCurrentPayablesToTradeSuppliers: "accountsPayable", CurrentLiabilities: "totalCurrentLiabilities", CurrentBorrowingsAndCurrentPortionOfNoncurrentBorrowings: "shortTermDebt", LongtermBorrowings: "longTermDebt", Borrowings: "totalDebt", Liabilities: "totalLiabilities", Equity: "totalStockholdersEquity", CashFlowsFromUsedInOperatingActivities: "operatingCashFlow", PurchaseOfPropertyPlantAndEquipmentIntangibleAssetsOtherThanGoodwillInvestmentPropertyAndOtherNoncurrentAssets: "capitalExpenditure", CashFlowsFromUsedInInvestingActivities: "investingCashFlow", CashFlowsFromUsedInFinancingActivities: "financingCashFlow", DividendsPaid: "commonStockDividendsPaid", PurchaseOfTreasuryShares: "commonStockRepurchased",
};

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];

function elements(node: Node): Element[] {
  const children = "childNodes" in node ? node.childNodes : [];
  return children.flatMap((child) => "tagName" in child ? [child, ...elements(child)] : elements(child));
}

function attr(element: Element, name: string) {
  const normalized = name.toLowerCase();
  return element.attrs.find((item) => item.name.toLowerCase() === normalized || `${item.prefix ?? ""}:${item.name}`.toLowerCase() === normalized)?.value ?? null;
}

function text(node: Node): string {
  if ("value" in node && typeof node.value === "string") return node.value;
  return "childNodes" in node ? node.childNodes.map(text).join("") : "";
}

function localName(element: Element) {
  return element.tagName.toLowerCase().split(":").at(-1) ?? element.tagName.toLowerCase();
}

function parseNumeric(raw: string, scale: number, sign: string | null) {
  const normalized = raw.replace(/[\s,]/g, "").replace(/[()]/g, "");
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  const signed = sign === "-" || (raw.includes("(") && raw.includes(")")) ? -Math.abs(value) : value;
  return signed * 10 ** scale;
}

export interface ParsedIxbrlDocument {
  facts: EsefFact[];
  contexts: Record<string, { periodEnd: string | null; instant: boolean }>;
  units: Record<string, string>;
}

export class EsefAdapter {
  readonly name = "esef" as const;
  isConfigured() { return getServerEnvironment().ENABLE_ESEF_INGESTION; }

  parseIxbrl(xhtml: string, filingUrl: string): ParsedIxbrlDocument {
    if (!xhtml.trim() || xhtml.length > 30_000_000) throw new ProviderError(this.name, "INVALID_RESPONSE", "Documento ESEF vuoto o oltre il limite di sicurezza.", false, 422);
    const document = parse(xhtml);
    const all = elements(document);
    const contexts: ParsedIxbrlDocument["contexts"] = {};
    const units: ParsedIxbrlDocument["units"] = {};
    for (const element of all) {
      const name = localName(element);
      if (name === "context") {
        const id = attr(element, "id");
        const instant = elements(element).find((child) => localName(child) === "instant");
        const endDate = elements(element).find((child) => localName(child) === "enddate");
        if (id) contexts[id] = { periodEnd: text(instant ?? endDate ?? element).trim() || null, instant: Boolean(instant) };
      }
      if (name === "unit") {
        const id = attr(element, "id");
        const measure = elements(element).find((child) => localName(child) === "measure");
        if (id && measure) units[id] = text(measure).trim().split(":").at(-1) ?? text(measure).trim();
      }
    }
    const facts = all.flatMap((element): EsefFact[] => {
      const tag = localName(element);
      if (tag !== "nonfraction" && tag !== "nonnumeric") return [];
      const concept = attr(element, "name"); const contextId = attr(element, "contextref");
      if (!concept || !contextId || !contexts[contextId]?.periodEnd) return [];
      const unitRef = attr(element, "unitref"); const scale = Number(attr(element, "scale") ?? "0"); const raw = text(element).trim();
      const value = tag === "nonfraction" ? parseNumeric(raw, Number.isFinite(scale) ? scale : 0, attr(element, "sign")) : raw || null;
      return [{ concept, value, unit: unitRef ? units[unitRef] ?? unitRef : null, periodEnd: contexts[contextId]!.periodEnd!, filingUrl, contextId, decimals: attr(element, "decimals"), scale: Number.isFinite(scale) ? scale : 0 }];
    });
    return { facts, contexts, units };
  }

  async downloadOfficialFiling(urlInput: string) {
    const url = new URL(urlInput);
    const allowedHosts = new Set(["filings.xbrl.org", "www.stellantis.com", "stellantis.com", "www.sec.gov"]);
    if (url.protocol !== "https:" || !allowedHosts.has(url.hostname) || url.username || url.password) throw new ProviderError(this.name, "UNSUPPORTED_SYMBOL", "URL ESEF non inclusa nell'allowlist delle fonti ufficiali.", false, 422);
    const response = await fetch(url, { headers: { Accept: "application/xhtml+xml,application/xml,text/html" }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new ProviderError(this.name, response.status === 404 ? "NOT_FOUND" : response.status === 429 ? "RATE_LIMITED" : "UPSTREAM_UNAVAILABLE", "Filing ESEF ufficiale non disponibile.", response.status === 429 || response.status >= 500, response.status === 404 ? 404 : 502);
    const length = Number(response.headers.get("content-length") ?? "0");
    if (length > 30_000_000) throw new ProviderError(this.name, "INVALID_RESPONSE", "Filing ESEF oltre il limite di sicurezza.", false, 422);
    return response.text();
  }

  normalizeOfficialFacts(input: { lei: string; filingDate: string; reportingPeriodEnd: string; facts: EsefFact[] }): NormalizedEsefFiling {
    const facts: Record<string, number | string | null> = {}; const provenance: FieldProvenance[] = [];
    for (const fact of input.facts) {
      const localName = fact.concept.includes(":") ? fact.concept.split(":").at(-1)! : fact.concept;
      const field = taxonomyMap[localName]; if (!field || fact.periodEnd !== input.reportingPeriodEnd) continue;
      facts[field] = fact.value;
      provenance.push({ field, provider: "esef", sourceTimestamp: input.filingDate, fetchedAt: new Date().toISOString(), quality: "verified", unit: fact.unit, formula: null, inputs: [], sourceConcept: fact.concept, sourceUrl: fact.filingUrl });
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
