import "server-only";

import type { CryptoProfile } from "@/types";
import { ProviderError } from "../errors";
import { coinGeckoGet } from "./client";
import { arrayValue, numericValue, objectValue, textValue } from "../shared";

const aliases: Record<string, string> = { BTC: "bitcoin", ETH: "ethereum", SOL: "solana", XRP: "ripple", ADA: "cardano", DOGE: "dogecoin", AVAX: "avalanche-2", DOT: "polkadot", LINK: "chainlink", MATIC: "matic-network", USDT: "tether", USDC: "usd-coin" };

export class CoinGeckoAdapter {
  readonly name = "coingecko" as const;
  async resolveId(symbolInput: string) {
    const symbol = symbolInput.toUpperCase().replace(/-USD$/, "");
    if (aliases[symbol]) return aliases[symbol];
    const results = objectValue(await coinGeckoGet("search", { query: symbol }, "resolve-id"));
    const match = arrayValue(results.coins).map(objectValue).find((row) => textValue(row, "symbol")?.toUpperCase() === symbol);
    const id = match ? textValue(match, "id") : null;
    if (!id) throw new ProviderError(this.name, "NOT_FOUND", "Asset CoinGecko non risolto.", false, 404);
    return id;
  }

  async getProfile(symbolInput: string): Promise<CryptoProfile> {
    const symbol = symbolInput.toUpperCase(); const id = await this.resolveId(symbol);
    const row = objectValue(await coinGeckoGet(`coins/${encodeURIComponent(id)}`, { localization: false, tickers: false, market_data: true, community_data: false, developer_data: false, sparkline: false }, "coin-profile"));
    const market = objectValue(row.market_data); const marketCap = objectValue(market.market_cap); const volume = objectValue(market.total_volume); const ath = objectValue(market.ath); const athDate = objectValue(market.ath_date);
    return { symbol, coinGeckoId: id, name: textValue(row, "name") ?? symbol, marketCap: numericValue(marketCap, "usd"), marketCapRank: numericValue(row, "market_cap_rank"), circulatingSupply: numericValue(market, "circulating_supply"), totalSupply: numericValue(market, "total_supply"), maxSupply: numericValue(market, "max_supply"), allTimeHigh: numericValue(ath, "usd"), allTimeHighDate: textValue(athDate, "usd"), volume24h: numericValue(volume, "usd"), priceChange24h: numericValue(market, "price_change_percentage_24h"), priceChange7d: numericValue(market, "price_change_percentage_7d"), priceChange30d: numericValue(market, "price_change_percentage_30d"), description: textValue(objectValue(row.description), "en"), categories: arrayValue(row.categories).filter((value): value is string => typeof value === "string"), };
  }

  async getGlobalContext() {
    const raw = objectValue(await coinGeckoGet("global", {}, "global-context")); const data = objectValue(raw.data); const cap = objectValue(data.total_market_cap); const volume = objectValue(data.total_volume); const dominance = objectValue(data.market_cap_percentage);
    return { totalMarketCapUsd: numericValue(cap, "usd"), totalVolume24hUsd: numericValue(volume, "usd"), bitcoinDominance: numericValue(dominance, "btc"), ethereumDominance: numericValue(dominance, "eth"), activeCryptocurrencies: numericValue(data, "active_cryptocurrencies"), marketCapChange24h: numericValue(data, "market_cap_change_percentage_24h_usd") };
  }
}

export const coinGeckoAdapter = new CoinGeckoAdapter();
