import { resolvePoliticalAssetContext } from "@/services/political/political-asset-resolver";
import { filterPoliticalPeriod } from "@/engines/political";
import { getPoliticalSyncHealth, loadPoliticalTransactionsForAsset } from "@/services/political/political-repository";
import { politicalCoverage } from "@/services/political/political-coverage";
import { derivePoliticalAssetDataStatus } from "@/services/political/political-asset-state";
import type { PoliticalAssetProvenance, PoliticalPeriod } from "@/types";

const symbols = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
if (!symbols.length) symbols.push("AAPL", "NVDA", "MSFT", "SPY", "QQQ", "STLAM.MI", "BTC-USD", "ETH-USD");
const requestedPeriod = (process.argv.find((argument) => argument.startsWith("--period="))?.split("=")[1] ?? "MAX") as PoliticalPeriod;

async function main() {
  const output = [];
  const health = await getPoliticalSyncHealth();
  for (const symbol of symbols) {
    const context = await resolvePoliticalAssetContext(symbol);
    const database = await loadPoliticalTransactionsForAsset(context, 5_000);
    const periods: PoliticalPeriod[] = ["7D", "30D", "90D", "6M", "1Y", "3Y", "5Y", "MAX"];
    const periodCounts = Object.fromEntries(periods.map((period) => [period, filterPoliticalPeriod(database.transactions, period).length]));
    const selectedRows = filterPoliticalPeriod(database.transactions, requestedPeriod);
    const coverage = politicalCoverage(requestedPeriod, selectedRows, database.transactions, health);
    const provenance: PoliticalAssetProvenance = { sourceMode: database.databaseStatus === "AVAILABLE" ? "DATABASE" : "UNAVAILABLE", providers: [...new Set(database.transactions.map((row) => row.provider))], databaseUsed: database.databaseStatus === "AVAILABLE", fallbackUsed: false, databaseStatus: database.databaseStatus, providerAttempts: [], lastSuccessfulSync: health.lastSync };
    output.push({
      requestedSymbol: symbol,
      canonicalSymbol: context.canonicalSymbol,
      assetClass: context.assetClass,
      instrumentId: context.instrumentId,
      issuerId: context.issuerId,
      matchStrategy: context.matchStrategy,
      aliases: context.aliases,
      cacheIdentity: context.cacheIdentity,
      dataStatus: derivePoliticalAssetDataStatus({ recordCount: selectedRows.length, context, provenance, coverage }),
      databaseStatus: database.databaseStatus,
      sourceMode: provenance.sourceMode,
      providers: provenance.providers,
      records: database.transactions.length,
      earliestDisclosure: database.transactions.map((row) => row.disclosureDate).sort()[0] ?? null,
      latestDisclosure: database.transactions.map((row) => row.disclosureDate).sort().at(-1) ?? null,
      selectedPeriod: requestedPeriod,
      selectedRows: selectedRows.length,
      rowsOutsidePeriod: database.transactions.length - selectedRows.length,
      periodCounts,
      historyCoveragePercent: coverage.historyCoveragePercent,
      mappingRate: coverage.mappingRate,
      sampleTransaction: database.transactions[0] ? { id: database.transactions[0].id, fingerprint: database.transactions[0].fingerprint, rawAsset: database.transactions[0].assetName, rawTicker: database.transactions[0].rawTicker, canonicalSymbol: database.transactions[0].symbol, instrumentId: database.transactions[0].canonicalInstrumentId, issuerId: database.transactions[0].canonicalIssuerId, disclosureDate: database.transactions[0].disclosureDate } : null,
    });
  }
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), assets: output }, null, 2));
}

void main();
