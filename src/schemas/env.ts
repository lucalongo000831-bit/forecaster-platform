import "server-only";

import { z } from "zod";

const emptyToUndefined = (value: unknown) => value === "" ? undefined : value;
const optionalString = z.preprocess(emptyToUndefined, z.string().trim().min(1).optional());
const optionalUrl = z.preprocess(emptyToUndefined, z.url().optional());
const optionalSecret = z.preprocess(emptyToUndefined, z.string().min(1).optional());
function trustedProviderUrl(defaultValue: string, protocols: string[], hostnames: string[]) {
  return z.preprocess(emptyToUndefined, z.url().default(defaultValue).refine((value) => {
    try {
      const url = new URL(value);
      return protocols.includes(url.protocol) && hostnames.includes(url.hostname.toLowerCase()) && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "URL provider non consentito"));
}
const booleanFlag = z.preprocess((value) => {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string" || value === "") return undefined;
  if (value.toLowerCase() === "true") return true;
  if (value.toLowerCase() === "false") return false;
  return value;
}, z.boolean().default(false));

const serverEnvironmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: optionalUrl,
  DIRECT_DATABASE_URL: optionalUrl,
  AUTH_SECRET: z.preprocess(emptyToUndefined, z.string().min(32).optional()),
  KAIRO_BOOTSTRAP_ADMIN_EMAIL: z.preprocess(emptyToUndefined, z.email().transform((value) => value.toLowerCase()).optional()),
  NEXTAUTH_URL: optionalUrl,
  YAHOO_FINANCE_ENABLED: z.preprocess((value) => value === undefined || value === "" ? true : value === "true" ? true : value === "false" ? false : value, z.boolean()),
  FMP_API_KEY: optionalSecret,
  FMP_BASE_URL: trustedProviderUrl("https://financialmodelingprep.com", ["https:"], ["financialmodelingprep.com", "www.financialmodelingprep.com"]),
  ALPHA_VANTAGE_API_KEY: optionalSecret,
  ALPHA_VANTAGE_BASE_URL: trustedProviderUrl("https://www.alphavantage.co", ["https:"], ["www.alphavantage.co"]),
  MASSIVE_API_KEY: optionalSecret,
  POLYGON_API_KEY: optionalSecret,
  MASSIVE_BASE_URL: trustedProviderUrl("https://api.massive.com", ["https:"], ["api.massive.com"]),
  MASSIVE_WEBSOCKET_URL: trustedProviderUrl("wss://socket.massive.com", ["wss:"], ["socket.massive.com"]),
  FRED_API_KEY: optionalSecret,
  BLS_API_KEY: optionalSecret,
  BEA_API_KEY: optionalSecret,
  EIA_API_KEY: optionalSecret,
  MARKETAUX_API_TOKEN: optionalSecret,
  OPENFIGI_API_KEY: optionalSecret,
  EODHD_API_TOKEN: optionalSecret,
  FINNHUB_API_KEY: optionalSecret,
  COINGECKO_API_KEY: optionalSecret,
  COINGECKO_API_MODE: z.enum(["demo", "pro"]).default("pro"),
  SEC_USER_AGENT: optionalString,
  ENABLE_ESEF_INGESTION: booleanFlag,
  OPENAI_API_KEY: optionalSecret,
  OPENAI_MODEL: optionalString,
  ENABLE_KAIRO_AI: booleanFlag,
  UPSTASH_REDIS_REST_URL: optionalUrl,
  UPSTASH_REDIS_REST_TOKEN: optionalSecret,
  CRON_SECRET: optionalSecret,
  INTERNAL_API_SECRET: optionalSecret,
  SENTRY_DSN: optionalUrl,
  MARKET_DATA_PRIMARY_PROVIDER: z.enum(["massive", "yahoo", "fmp"]).default("massive"),
  MARKET_DATA_FALLBACK_PROVIDER: z.enum(["massive", "yahoo", "fmp"]).default("yahoo"),
  FUNDAMENTALS_PRIMARY_PROVIDER: z.enum(["fmp", "yahoo"]).default("fmp"),
  NEWS_PRIMARY_PROVIDER: z.enum(["alpha-vantage", "yahoo"]).default("alpha-vantage"),
  ENABLE_REALTIME_DATA: booleanFlag,
  MASSIVE_SNAPSHOT_ENABLED: booleanFlag,
  FMP_STATEMENTS_ENABLED: booleanFlag,
  FMP_HISTORICAL_RATIOS_ENABLED: booleanFlag,
  ENABLE_AI_NEWS_ANALYSIS: booleanFlag,
  ENABLE_DEMO_DATA: booleanFlag,
  ENABLE_BACKTEST_API: booleanFlag,
});

const publicEnvironmentSchema = z.object({
  NEXT_PUBLIC_APP_URL: optionalUrl,
  NEXT_PUBLIC_SENTRY_DSN: optionalUrl,
});

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;
export type PublicEnvironment = z.infer<typeof publicEnvironmentSchema>;

export function getServerEnvironment(source: NodeJS.ProcessEnv = process.env): ServerEnvironment {
  const result = serverEnvironmentSchema.safeParse(source);
  if (!result.success) throw new Error("Configurazione server non valida: variabile mancante o non valida");
  return result.data;
}

export function getPublicEnvironment(source: NodeJS.ProcessEnv = process.env): PublicEnvironment {
  const result = publicEnvironmentSchema.safeParse(source);
  if (!result.success) throw new Error("Configurazione pubblica non valida");
  return result.data;
}

export function getEnvironmentStatus(source: NodeJS.ProcessEnv = process.env) {
  const env = getServerEnvironment(source);
  return {
    databaseConfigured: Boolean(env.DATABASE_URL),
    directDatabaseConfigured: Boolean(env.DIRECT_DATABASE_URL),
    authConfigured: Boolean(env.AUTH_SECRET),
    redisConfigured: Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN),
    fmpConfigured: Boolean(env.FMP_API_KEY),
    alphaVantageConfigured: Boolean(env.ALPHA_VANTAGE_API_KEY),
    massiveConfigured: Boolean(env.MASSIVE_API_KEY ?? env.POLYGON_API_KEY),
    fredConfigured: Boolean(env.FRED_API_KEY),
    blsConfigured: Boolean(env.BLS_API_KEY),
    beaConfigured: Boolean(env.BEA_API_KEY),
    eiaConfigured: Boolean(env.EIA_API_KEY),
    marketauxConfigured: Boolean(env.MARKETAUX_API_TOKEN),
    openFigiConfigured: Boolean(env.OPENFIGI_API_KEY),
    eodhdConfigured: Boolean(env.EODHD_API_TOKEN),
    finnhubConfigured: Boolean(env.FINNHUB_API_KEY),
    coinGeckoConfigured: Boolean(env.COINGECKO_API_KEY),
    secConfigured: Boolean(env.SEC_USER_AGENT),
    esefEnabled: env.ENABLE_ESEF_INGESTION,
    cronConfigured: Boolean(env.CRON_SECRET),
    internalApiConfigured: Boolean(env.INTERNAL_API_SECRET),
  };
}
