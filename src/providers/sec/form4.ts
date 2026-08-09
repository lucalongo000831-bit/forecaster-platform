import "server-only";

import { objectValue, arrayValue } from "../shared";
import { resolveSecIdentity } from "./edgar-adapter";
import { secArchiveText, secGet } from "./client";

export interface SecForm4Transaction {
  owner: string;
  relationship: string | null;
  transactionDate: string | null;
  transactionCode: string | null;
  shares: number | null;
  price: number | null;
  acquiredDisposed: "A" | "D" | null;
  filingDate: string | null;
  accessionNumber: string;
  sourceUrl: string;
}

function text(xml: string, tag: string) {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>\\s*(?:<value>)?([^<]*)(?:</value>)?\\s*</${tag}>`, "i"));
  return match?.[1]?.trim() || null;
}
function number(xml: string, tag: string) { const value = text(xml, tag); const parsed = value ? Number(value.replaceAll(",", "")) : Number.NaN; return Number.isFinite(parsed) ? parsed : null; }

export function parseSecForm4(xml: string, metadata: { filingDate: string | null; accessionNumber: string; sourceUrl: string }): SecForm4Transaction[] {
  const owner = text(xml, "rptOwnerName") ?? "Undisclosed reporting owner";
  const relationship = [text(xml, "officerTitle"), text(xml, "isDirector") === "1" ? "Director" : null, text(xml, "isTenPercentOwner") === "1" ? "10% owner" : null].filter(Boolean).join(" · ") || null;
  const blocks = [...xml.matchAll(/<nonDerivativeTransaction>([\s\S]*?)<\/nonDerivativeTransaction>/gi)].map((match) => match[1]!);
  return blocks.map((block) => ({ owner, relationship, transactionDate: text(block, "transactionDate"), transactionCode: text(block, "transactionCode"), shares: number(block, "transactionShares"), price: number(block, "transactionPricePerShare"), acquiredDisposed: (text(block, "transactionAcquiredDisposedCode") as "A" | "D" | null), filingDate: metadata.filingDate, accessionNumber: metadata.accessionNumber, sourceUrl: metadata.sourceUrl }));
}

export async function getSecForm4Transactions(symbol: string, limit = 12) {
  const identity = await resolveSecIdentity(symbol); const raw = objectValue(await secGet(`/submissions/CIK${identity.cik}.json`, "form4-submissions")); const recent = objectValue(objectValue(raw.filings).recent);
  const forms = arrayValue(recent.form); const accessions = arrayValue(recent.accessionNumber); const primaryDocuments = arrayValue(recent.primaryDocument); const filingDates = arrayValue(recent.filingDate);
  const filings = forms.flatMap((form, index) => form === "4" && typeof accessions[index] === "string" && typeof primaryDocuments[index] === "string" ? [{ accession: accessions[index] as string, document: primaryDocuments[index] as string, filingDate: typeof filingDates[index] === "string" ? filingDates[index] as string : null }] : []).slice(0, Math.max(1, Math.min(limit, 20)));
  const cik = identity.cik.replace(/^0+/, "");
  const settled = await Promise.allSettled(filings.map(async (filing) => { const url = new URL(`https://www.sec.gov/Archives/edgar/data/${cik}/${filing.accession.replaceAll("-", "")}/${encodeURIComponent(filing.document)}`); return parseSecForm4(await secArchiveText(url), { filingDate: filing.filingDate, accessionNumber: filing.accession, sourceUrl: url.toString() }); }));
  return settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
}
