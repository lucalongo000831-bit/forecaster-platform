import { afterEach, describe, expect, it } from "vitest";
import { providerSymbol, resolveInstrument } from "./instrument-resolver";

const originalFixtureFlag = process.env.KAIRO_E2E_PROVIDER_FIXTURES;
const originalRunFlag = process.env.KAIRO_E2E_RUN;

afterEach(() => {
  if (originalFixtureFlag === undefined) delete process.env.KAIRO_E2E_PROVIDER_FIXTURES;
  else process.env.KAIRO_E2E_PROVIDER_FIXTURES = originalFixtureFlag;
  if (originalRunFlag === undefined) delete process.env.KAIRO_E2E_RUN;
  else process.env.KAIRO_E2E_RUN = originalRunFlag;
});

describe("providerSymbol", () => {
  it("keeps listing-specific provider mappings distinct", () => {
    const instrument = { mappings: [{ provider: "eodhd" as const, symbol: "STLAM.MI", exchangeCode: "MI", providerInstrumentId: null, confidence: 1, verifiedAt: "2026-01-01" }] };
    expect(providerSymbol(instrument as never, "eodhd")).toBe("STLAM.MI");
    expect(providerSymbol(instrument as never, "sec-edgar")).toBeNull();
  });

  it.each(["ETH", "ETHUSD", "ETH-USD", "ETH-USD.CC", "eth-usd", "eth-usd.cc"])("resolves %s to the canonical ETH instrument", async (input) => {
    process.env.KAIRO_E2E_PROVIDER_FIXTURES = "true";
    process.env.KAIRO_E2E_RUN = "playwright";
    const instrument = await resolveInstrument(input);
    expect(instrument).toMatchObject({ canonicalSymbol: "ETH-USD", kind: "CRYPTO", exchange: "CRYPTO" });
    expect(providerSymbol(instrument, "yahoo")).toBe("ETH-USD");
  });

  it.each(["BTC", "BTCUSD", "BTC-USD", "BTC-USD.CC", "btc-usd", "btc-usd.cc"])("resolves %s to the canonical BTC instrument", async (input) => {
    process.env.KAIRO_E2E_PROVIDER_FIXTURES = "true";
    process.env.KAIRO_E2E_RUN = "playwright";
    const instrument = await resolveInstrument(input);
    expect(instrument).toMatchObject({ canonicalSymbol: "BTC-USD", kind: "CRYPTO", exchange: "CRYPTO" });
    expect(providerSymbol(instrument, "yahoo")).toBe("BTC-USD");
  });
});
