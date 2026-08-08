import { describe, expect, it } from "vitest";
import { getEnvironmentStatus, getServerEnvironment } from "./env";

describe("server environment", () => {
  it("uses safe defaults while optional external services are absent", () => {
    const env = getServerEnvironment({ NODE_ENV: "test" });
    expect(env.YAHOO_FINANCE_ENABLED).toBe(true);
    expect(env.ENABLE_DEMO_DATA).toBe(false);
    expect(env.ENABLE_KAIRO_AI).toBe(false);
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
    });
    expect(status).toMatchObject({ databaseConfigured: true, fmpConfigured: true, alphaVantageConfigured: true, massiveConfigured: true });
    expect(Object.values(status).every((value) => typeof value === "boolean")).toBe(true);
  });

  it("rejects provider base URLs outside the explicit HTTPS allowlist", () => {
    expect(() => getServerEnvironment({ NODE_ENV: "test", FMP_BASE_URL: "http://financialmodelingprep.com" })).toThrow("Configurazione server non valida");
    expect(() => getServerEnvironment({ NODE_ENV: "test", ALPHA_VANTAGE_BASE_URL: "https://attacker.test" })).toThrow("Configurazione server non valida");
    expect(() => getServerEnvironment({ NODE_ENV: "test", MASSIVE_WEBSOCKET_URL: "ws://socket.massive.com" })).toThrow("Configurazione server non valida");
  });
});
