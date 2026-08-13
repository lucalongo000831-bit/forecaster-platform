import "server-only";

import { getServerEnvironment } from "@/schemas/env";
import type { KairoDataV2ProviderName } from "./types";

interface BaseProviderConfig {
  provider: KairoDataV2ProviderName;
  baseUrl: string;
  timeoutMs: number;
  configured: boolean;
}

export interface FredConfig extends BaseProviderConfig {
  provider: "fred";
  apiKey?: string;
}

export interface BlsConfig extends BaseProviderConfig {
  provider: "bls";
  registrationKey?: string;
}

export interface BeaConfig extends BaseProviderConfig {
  provider: "bea";
  userId?: string;
}

export interface EiaConfig extends BaseProviderConfig {
  provider: "eia";
  apiKey?: string;
}

export interface MarketauxConfig extends BaseProviderConfig {
  provider: "marketaux";
  apiToken?: string;
}

export interface OpenFigiConfig extends BaseProviderConfig {
  provider: "openfigi";
  apiKey?: string;
}

export interface KairoDataV2ProviderConfigs {
  fred: FredConfig;
  bls: BlsConfig;
  bea: BeaConfig;
  eia: EiaConfig;
  marketaux: MarketauxConfig;
  openfigi: OpenFigiConfig;
}

const DEFAULT_TIMEOUT_MS = 12_000;

export function getKairoDataV2ProviderConfigs(source: NodeJS.ProcessEnv = process.env): KairoDataV2ProviderConfigs {
  const env = getServerEnvironment(source);
  return {
    fred: {
      provider: "fred",
      baseUrl: "https://api.stlouisfed.org",
      timeoutMs: DEFAULT_TIMEOUT_MS,
      configured: Boolean(env.FRED_API_KEY),
      apiKey: env.FRED_API_KEY,
    },
    bls: {
      provider: "bls",
      baseUrl: "https://api.bls.gov",
      timeoutMs: DEFAULT_TIMEOUT_MS,
      configured: Boolean(env.BLS_API_KEY),
      registrationKey: env.BLS_API_KEY,
    },
    bea: {
      provider: "bea",
      baseUrl: "https://apps.bea.gov",
      timeoutMs: DEFAULT_TIMEOUT_MS,
      configured: Boolean(env.BEA_API_KEY),
      userId: env.BEA_API_KEY,
    },
    eia: {
      provider: "eia",
      baseUrl: "https://api.eia.gov",
      timeoutMs: DEFAULT_TIMEOUT_MS,
      configured: Boolean(env.EIA_API_KEY),
      apiKey: env.EIA_API_KEY,
    },
    marketaux: {
      provider: "marketaux",
      baseUrl: "https://api.marketaux.com",
      timeoutMs: DEFAULT_TIMEOUT_MS,
      configured: Boolean(env.MARKETAUX_API_TOKEN),
      apiToken: env.MARKETAUX_API_TOKEN,
    },
    openfigi: {
      provider: "openfigi",
      baseUrl: "https://api.openfigi.com",
      timeoutMs: DEFAULT_TIMEOUT_MS,
      configured: Boolean(env.OPENFIGI_API_KEY),
      apiKey: env.OPENFIGI_API_KEY,
    },
  };
}
