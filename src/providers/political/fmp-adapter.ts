import "server-only";

import { getServerEnvironment } from "@/schemas/env";
import { safeExternalHttpsUrl } from "@/lib/safe-url";
import { normalizeSymbol } from "@/services/yahoo/symbol-resolver";
import { fmpGet, numberValue, stringValue } from "../fmp/client";
import { providerResult } from "../metadata";
import type { PoliticalDisclosure, PoliticalProvider } from "../types";
import { normalizePoliticalTransactionType, stablePoliticalId } from "@/engines/political";

function transactionType(value: string | null): PoliticalDisclosure["transactionType"] {
  return normalizePoliticalTransactionType(value);
}

export function mapDisclosure(row: Record<string, unknown>, chamber: PoliticalDisclosure["chamber"]): PoliticalDisclosure | null {
  const transactionDate = stringValue(row, "transactionDate", "transaction_date", "date");
  const asset = stringValue(row, "assetDescription", "asset", "assetName", "securityName") ?? "Asset not specified";
  if (!transactionDate) return null;
  const firstName = stringValue(row, "firstName", "first_name") ?? "";
  const lastName = stringValue(row, "lastName", "last_name", "representative", "senator") ?? "";
  const politician = stringValue(row, "name") ?? (`${firstName} ${lastName}`.trim() || "Name unavailable");
  const symbol = stringValue(row, "symbol", "ticker");
  const disclosureDate = stringValue(row, "disclosureDate", "disclosure_date", "filingDate");
  const rawType = stringValue(row, "transactionType", "transaction_type", "type");
  const filingId = stringValue(row, "filingId", "filing_id", "documentId", "docID");
  const sourceId = stringValue(row, "id", "sourceId", "transactionId") ?? stablePoliticalId(politician, symbol, transactionDate, disclosureDate, rawType, filingId);
  return {
    id: `political-${sourceId}`,
    sourceId,
    politician,
    chamber,
    party: stringValue(row, "party", "partyName"),
    state: stringValue(row, "state", "stateCode"),
    district: stringValue(row, "district", "office"),
    symbol,
    asset,
    assetType: stringValue(row, "assetType", "asset_type", "securityType"),
    transactionType: transactionType(rawType),
    rawTransactionType: rawType,
    transactionDate: transactionDate.slice(0, 10),
    disclosureDate: disclosureDate?.slice(0, 10) ?? null,
    amountRange: stringValue(row, "amount", "amountRange", "amount_range"),
    ownership: stringValue(row, "owner", "ownership", "assetType"),
    capitalGains: numberValue(row, "capitalGainsOver200USD", "capitalGains"),
    sourceUrl: safeExternalHttpsUrl(stringValue(row, "link", "url")),
    filingId,
    filingType: stringValue(row, "filingType", "filing_type", "formType"),
    amendment: Boolean(stringValue(row, "amendment", "filingType", "filing_type")?.toLowerCase().includes("amend")),
  };
}

export class FmpPoliticalAdapter implements PoliticalProvider {
  readonly name = "fmp" as const;
  isConfigured() { return Boolean(getServerEnvironment().FMP_API_KEY); }

  private async request(chamber: PoliticalDisclosure["chamber"], symbolInput?: string, limit = 100) {
    const symbol = symbolInput ? normalizeSymbol(symbolInput) : undefined;
    const endpoint = chamber === "SENATE" ? (symbol ? "senate-trades" : "senate-latest") : (symbol ? "house-trades" : "house-latest");
    const requestedLimit = Math.min(500, Math.max(1, limit));
    const pageSize = Math.min(20, requestedLimit);
    const rows: Record<string, unknown>[] = [];
    if (symbol) {
      rows.push(...await fmpGet(endpoint, { symbol }, `political:${chamber.toLowerCase()}:symbol`));
    } else {
      // Plans expose different history depths. Preserve successful live pages if
      // a later page is rate-limited or restricted instead of losing the batch.
      for (let page = 0; rows.length < requestedLimit; page += 1) {
        try {
          const batch = await fmpGet(endpoint, { page, limit: pageSize }, `political:${chamber.toLowerCase()}:page:${page}`);
          rows.push(...batch);
          if (batch.length < pageSize) break;
        } catch (error) {
          if (rows.length === 0) throw error;
          break;
        }
      }
    }
    const data = rows.flatMap((row) => {
      const mapped = mapDisclosure(row, chamber);
      return mapped ? [mapped] : [];
    }).slice(0, requestedLimit);
    const sourceTimestamp = data.map((item) => item.disclosureDate ?? item.transactionDate).sort().at(-1) ?? null;
    return providerResult(this.name, data, { sourceTimestamp, freshness: "cached", freshnessType: "CACHED", quality: data.length ? "verified" : "partial" });
  }

  getSenateTrades(symbol?: string, limit?: number) { return this.request("SENATE", symbol, limit); }
  getHouseTrades(symbol?: string, limit?: number) { return this.request("HOUSE", symbol, limit); }
}
