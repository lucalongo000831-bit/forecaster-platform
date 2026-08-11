import { describe, expect, it } from "vitest";
import { getEnvironmentStatus, getPublicEnvironment, getServerEnvironment } from "./env";

const providerEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  FRED_API_KEY: "test-only",
  BLS_API_KEY: "test-only",
  BEA_API_KEY: "test-only",
  EIA_API_KEY: "test-only",
  MARKETAUX_API_TOKEN: "test-only",
  OPENFIGI_API_KEY: "test-only",
};

describe("server environment", () => {
  it("uses safe defaults while optional external services are absent", () => {
    const env = getServerEnvironment({ NODE_ENV: "test" });
    expect(env.YAHOO_FINANCE_ENABLED).toBe(true);
    expect(env.ENABLE_DEMO_DATA).toBe(false);
    expect(env.ENABLE_KAIRO_AI).toBe(false);
    expect(env.ENABLE_ESEF_INGESTION).toBe(false);
    expect(env.COINGECKO_API_MODE).toBe("pro");
    expect(env.MARKET_DATA_PRIMARY_PROVIDER).toBe("massive");
  });

  it("rejects an undersized authentication secret without exposing it", () => {
    expect(() => getServerEnvironment({ NODE_ENV: "test", AUTH_SECRET: "short" })).toThrow("Configurazione server non valida");
  });

  it("returns booleans only from the configuration status", () => {
    const status = getEnvironmentStatus({
      NODE_ENV: "test",
      DATABASE_URL: "postgres://example.test/database",
      FMP_API_KEY: "test-value",
      ALPHA_VANTAGE_API_KEY: "test-value",
      MASSIVE_API_KEY: "test-value",
      EODHD_API_TOKEN: "test-value",
      FINNHUB_API_KEY: "test-value",
      COINGECKO_API_KEY: "test-value",
      SEC_USER_AGENT: "KAIRO test contact@example.test",
    });
    expect(status).toMatchObject({ databaseConfigured: true, fmpConfigured: true, alphaVantageConfigured: true, massiveConfigured: true, eodhdConfigured: true, finnhubConfigured: true, coinGeckoConfigured: true, secConfigured: true });
    expect(Object.values(status).every((value) => typeof value === "boolean")).toBe(true);
  });

  it("validates CoinGecko mode and non-empty SEC identification", () => {
    expect(getServerEnvironment({ NODE_ENV: "test", COINGECKO_API_MODE: "demo", SEC_USER_AGENT: "KAIRO test contact@example.test" })).toMatchObject({ COINGECKO_API_MODE: "demo", SEC_USER_AGENT: "KAIRO test contact@example.test" });
    expect(() => getServerEnvironment({ NODE_ENV: "test", COINGECKO_API_MODE: "enterprise" })).toThrow("Configurazione server non valida");
  });

  it("rejects provider base URLs outside the explicit HTTPS allowlist", () => {
    expect(() => getServerEnvironment({ NODE_ENV: "test", FMP_BASE_URL: "http://financialmodelingprep.com" })).toThrow("Configurazione server non valida");
    expect(() => getServerEnvironment({ NODE_ENV: "test", ALPHA_VANTAGE_BASE_URL: "https://attacker.test" })).toThrow("Configurazione server non valida");
    expect(() => getServerEnvironment({ NODE_ENV: "test", MASSIVE_WEBSOCKET_URL: "ws://socket.massive.com" })).toThrow("Configurazione server non valida");
  });
});

describe("Kairo Data V2 environment", () => {
  it("accepts all new credentials as optional server environment values", () => {
    const environment = getServerEnvironment(providerEnvironment);
    expect(environment.FRED_API_KEY).toBe("test-only");
    expect(environment.BLS_API_KEY).toBe("test-only");
    expect(environment.BEA_API_KEY).toBe("test-only");
    expect(environment.EIA_API_KEY).toBe("test-only");
    expect(environment.MARKETAUX_API_TOKEN).toBe("test-only");
    expect(environment.OPENFIGI_API_KEY).toBe("test-only");
  });

  it("reports configuration status without returning credential values", () => {
    const status = getEnvironmentStatus(providerEnvironment);
    expect(status).toMatchObject({
      fredConfigured: true,
      blsConfigured: true,
      beaConfigured: true,
      eiaConfigured: true,
      marketauxConfigured: true,
      openFigiConfigured: true,
    });
    expect(JSON.stringify(status)).not.toContain("test-only");
  });

  it("does not map provider credentials into the public environment", () => {
    const publicEnvironment = getPublicEnvironment({
      ...providerEnvironment,
      NEXT_PUBLIC_FRED_API_KEY: "must-not-be-mapped",
      NEXT_PUBLIC_OPENFIGI_API_KEY: "must-not-be-mapped",
    });
    expect(publicEnvironment).toEqual({});
  });
});
