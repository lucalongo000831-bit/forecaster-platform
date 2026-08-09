import "server-only";

import { getServerEnvironment } from "@/schemas/env";

export type CoinGeckoApiMode = "demo" | "pro";

const COINGECKO_BASE_URLS: Record<CoinGeckoApiMode, string> = {
  demo: "https://api.coingecko.com/api/v3/",
  pro: "https://pro-api.coingecko.com/api/v3/",
};

const COINGECKO_AUTH_HEADERS: Record<CoinGeckoApiMode, string> = {
  demo: "x-cg-demo-api-key",
  pro: "x-cg-pro-api-key",
};

export function getCoinGeckoConfiguration() {
  const env = getServerEnvironment();
  const mode = env.COINGECKO_API_MODE;

  return {
    configured: Boolean(env.COINGECKO_API_KEY),
    mode,
    baseUrl: COINGECKO_BASE_URLS[mode],
    headers: env.COINGECKO_API_KEY ? { [COINGECKO_AUTH_HEADERS[mode]]: env.COINGECKO_API_KEY } : {},
  } as const;
}
