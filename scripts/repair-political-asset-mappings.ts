import { repairPoliticalAssetMappings } from "@/services/political/political-repository";

const apply = process.argv.includes("--apply");
const symbols = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
if (!symbols.length) symbols.push("AAPL", "NVDA", "MSFT", "SPY", "QQQ", "STLA", "STLAM.MI", "BTC-USD", "ETH-USD");

async function main() {
  if (!apply) {
    console.log(JSON.stringify({ applied: false, symbols, message: "Dry run only. Re-run with --apply to update canonical instrument and issuer links." }, null, 2));
    return;
  }
  const result = await repairPoliticalAssetMappings(symbols);
  console.log(JSON.stringify({ applied: true, ...result }, null, 2));
}

void main();
