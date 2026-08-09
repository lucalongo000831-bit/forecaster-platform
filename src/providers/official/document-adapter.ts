import "server-only";

import { createHash } from "node:crypto";
import { parse, type DefaultTreeAdapterMap } from "parse5";
import { providerCached } from "@/providers/cache";
import { ProviderError } from "@/providers/errors";
import { providerResult } from "@/providers/metadata";
import { arrayValue, objectValue } from "@/providers/shared";
import { normalizeCik, secArchiveText, secGet } from "@/providers/sec/client";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];

export type OfficialDocumentType = "ANNUAL_REPORT" | "HALF_YEAR_REPORT" | "EARNINGS_RELEASE" | "INVESTOR_PRESENTATION" | "DIVIDEND_ANNOUNCEMENT" | "SHARE_BUYBACK_ANNOUNCEMENT" | "CAPITAL_MARKETS_DOCUMENT";

export interface OfficialDocumentRecord {
  issuerId: string;
  documentType: OfficialDocumentType;
  period: string;
  publicationDate: string;
  sourceUrl: string;
  filingFormat: "IXBRL" | "XHTML" | "PDF";
  language: string;
  hash: string;
  processedAt: string;
}

export interface OfficialSegmentMetric {
  name: string;
  revenue: number | null;
  priorRevenue: number | null;
  adjustedOperatingIncome: number | null;
  priorAdjustedOperatingIncome: number | null;
  shipments: number | null;
  priorShipments: number | null;
}

export interface OfficialAutomotiveMetrics {
  period: string;
  currency: string;
  adjustedOperatingIncome: number | null;
  priorAdjustedOperatingIncome: number | null;
  industrialFreeCashFlow: number | null;
  priorIndustrialFreeCashFlow: number | null;
  industrialNetFinancialPosition: number | null;
  priorIndustrialNetFinancialPosition: number | null;
  consolidatedShipments: number | null;
  priorConsolidatedShipments: number | null;
  segments: OfficialSegmentMetric[];
  brandPortfolio: string[];
  centralizedDesignAndManufacturing: boolean;
  dealerFinanceOffering: boolean;
  document: OfficialDocumentRecord;
}

function descendants(node: Node): Element[] {
  const children = "childNodes" in node ? node.childNodes : [];
  return children.flatMap((child) => "tagName" in child ? [child, ...descendants(child)] : descendants(child));
}

function nodeText(node: Node): string {
  if ("value" in node && typeof node.value === "string") return node.value;
  return "childNodes" in node ? node.childNodes.map(nodeText).join("") : "";
}

function clean(value: string) { return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim(); }
function tag(element: Element) { return element.tagName.toLowerCase().split(":").at(-1) ?? element.tagName.toLowerCase(); }

function directCells(row: Element) {
  return ("childNodes" in row ? row.childNodes : []).filter((child): child is Element => "tagName" in child && ["td", "th"].includes(tag(child))).map((cell) => clean(nodeText(cell)));
}

function numericCells(cells: string[]) {
  return cells.slice(1).flatMap((cell): number[] => {
    const compact = cell.replace(/\s+/g, "");
    if (!compact || compact === "—" || !/^\(?-?[\d,.]+\)?%?$/.test(compact)) return [];
    const parsed = Number(compact.replace(/[(),%]/g, "").replaceAll(",", ""));
    if (!Number.isFinite(parsed)) return [];
    return [compact.startsWith("(") ? -Math.abs(parsed) : parsed];
  });
}

function exactRows(rows: string[][], label: string) {
  return rows.filter((cells) => clean(cells[0] ?? "").toLowerCase() === label.toLowerCase());
}

function shortestNumericRow(rows: string[][], label: string, minimumValues = 2) {
  return exactRows(rows, label)
    .map((cells) => ({ cells, values: numericCells(cells) }))
    .filter(({ values }) => values.length >= minimumValues)
    .sort((left, right) => left.values.length - right.values.length)[0]?.values ?? [];
}

function inferPeriod(document: DefaultTreeAdapterMap["document"]) {
  const title = descendants(document).find((element) => tag(element) === "title");
  return clean(nodeText(title ?? document)).match(/(20\d{2})1231/)?.[1] ?? "unknown";
}

function portfolioBrands(text: string) {
  const match = text.match(/vehicles under the ([A-Za-z][A-Za-z ]+?) brand;\s*\(ii\) premium vehicles covered by (.+?) brands;\s*\(iii\).*?under the ([A-Za-z][A-Za-z ]+?) brand;\s*\(iv\) American brands covering (.+?) vehicles and \(v\) European brands covering (.+?) vehicles\./i);
  if (!match) return [];
  return [...new Set(match.slice(1).flatMap((clause) => clause.split(/,|\band\b/i)).map(clean).filter((name) => /^\p{L}[\p{L} ]{0,35}$/u.test(name)))];
}

export function parseOfficialAutomotiveFiling(xhtml: string, input: { issuerId: string; publicationDate: string; sourceUrl: string }): OfficialAutomotiveMetrics {
  if (!xhtml.trim() || xhtml.length > 30_000_000) throw new ProviderError("sec-edgar", "INVALID_RESPONSE", "Documento ufficiale vuoto o oltre il limite di sicurezza.", false, 422);
  const document = parse(xhtml);
  const filingText = clean(nodeText(document));
  // iXBRL generators frequently split one logical statement over several HTML
  // tables. Parse rows document-wide so extraction is independent from that
  // presentational detail, while retaining strict labels and structural checks.
  const allRows = descendants(document)
    .filter((element) => tag(element) === "tr")
    .map(directCells)
    .filter((cells) => cells.length);
  const companyAoi = shortestNumericRow(allRows, "Adjusted operating income/(loss)");
  const industrialFcf = shortestNumericRow(allRows, "Industrial free cash flows");
  const netPosition = shortestNumericRow(allRows, "Net financial position", 5);
  const shipments = shortestNumericRow(allRows, "Total Consolidated shipments");
  const segments: OfficialSegmentMetric[] = allRows.flatMap((cells) => {
    const values = numericCells(cells);
    const name = clean(cells[0] ?? "").replace(/\(\d+\)$/g, "").trim();
    const structurallySegmented = values.length === 6
      && Math.abs(values[0] ?? 0) >= 1_000
      && Math.abs(values[1] ?? 0) >= 1_000
      && (values[4] ?? -1) >= 0
      && (values[5] ?? -1) >= 0
      && (values[4] ?? 0) < 10_000
      && (values[5] ?? 0) < 10_000
      && Math.abs(values[2] ?? 0) < Math.abs(values[0] ?? 0)
      && Math.abs(values[3] ?? 0) < Math.abs(values[1] ?? 0);
    if (!name || !structurallySegmented || /total|eliminations|unallocated|reconciliation/i.test(name)) return [];
    return [{ name, revenue: values[0]! * 1_000_000, priorRevenue: values[1]! * 1_000_000, adjustedOperatingIncome: values[2]! * 1_000_000, priorAdjustedOperatingIncome: values[3]! * 1_000_000, shipments: values[4]! * 1_000, priorShipments: values[5]! * 1_000 }];
  });
  const period = inferPeriod(document);
  return {
    period, currency: "EUR",
    adjustedOperatingIncome: companyAoi[0] === undefined ? null : companyAoi[0] * 1_000_000,
    priorAdjustedOperatingIncome: companyAoi[1] === undefined ? null : companyAoi[1] * 1_000_000,
    industrialFreeCashFlow: industrialFcf[0] === undefined ? null : industrialFcf[0] * 1_000_000,
    priorIndustrialFreeCashFlow: industrialFcf[1] === undefined ? null : industrialFcf[1] * 1_000_000,
    industrialNetFinancialPosition: netPosition[1] === undefined ? null : netPosition[1] * 1_000_000,
    priorIndustrialNetFinancialPosition: netPosition[4] === undefined ? null : netPosition[4] * 1_000_000,
    consolidatedShipments: shipments[0] === undefined ? null : shipments[0] * 1_000,
    priorConsolidatedShipments: shipments[1] === undefined ? null : shipments[1] * 1_000,
    segments,
    brandPortfolio: portfolioBrands(filingText),
    centralizedDesignAndManufacturing: /centralizes design, engineering, development and manufacturing operations/i.test(filingText),
    dealerFinanceOffering: /provides retail and dealer financing, leasing and rental services/i.test(filingText),
    document: { issuerId: input.issuerId, documentType: "ANNUAL_REPORT", period, publicationDate: input.publicationDate, sourceUrl: input.sourceUrl, filingFormat: "IXBRL", language: "en", hash: createHash("sha256").update(xhtml).digest("hex"), processedAt: new Date().toISOString() },
  };
}

function recentFiling(raw: unknown) {
  const recent = objectValue(objectValue(objectValue(raw).filings).recent);
  const forms = arrayValue(recent.form); const index = forms.findIndex((form) => form === "20-F" || form === "40-F" || form === "10-K");
  if (index < 0) throw new ProviderError("sec-edgar", "NOT_FOUND", "Nessun annual filing ufficiale disponibile.", false, 404);
  const accession = String(arrayValue(recent.accessionNumber)[index] ?? "");
  const primaryDocument = String(arrayValue(recent.primaryDocument)[index] ?? "");
  const publicationDate = String(arrayValue(recent.filingDate)[index] ?? "");
  if (!/^\d{10}-\d{2}-\d{6}$/.test(accession) || !/^[A-Za-z0-9._-]+$/.test(primaryDocument) || !/^\d{4}-\d{2}-\d{2}$/.test(publicationDate)) throw new ProviderError("sec-edgar", "INVALID_RESPONSE", "Indice filing SEC non valido.", false, 502);
  return { accession, primaryDocument, publicationDate };
}

export async function getOfficialAutomotiveMetrics(cikInput: string) {
  const cik = normalizeCik(cikInput);
  return providerCached(`official-filing-metrics:v3:${cik}`, { freshSeconds: 86_400, staleSeconds: 604_800 }, async () => {
    const submissions = await secGet(`/submissions/CIK${cik}.json`, "official-filing-index");
    const filing = recentFiling(submissions);
    const sourceUrl = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${filing.accession.replaceAll("-", "")}/${filing.primaryDocument}`;
    const xhtml = await secArchiveText(new URL(sourceUrl));
    const data = parseOfficialAutomotiveFiling(xhtml, { issuerId: cik, publicationDate: filing.publicationDate, sourceUrl });
    return providerResult("sec-edgar", data, { sourceTimestamp: filing.publicationDate, freshness: "cached", freshnessType: "END_OF_DAY", quality: "verified" });
  });
}
