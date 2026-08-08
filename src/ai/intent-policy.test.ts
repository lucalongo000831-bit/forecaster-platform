import { describe, expect, it } from "vitest";
import { requiredToolForMessage } from "./intent-policy";
import { KAIRO_ANALYST_PROMPT_V1 } from "./system-prompt";

describe("Kairo financial intent policy", () => {
  it("routes company analysis through company intelligence", () => {
    expect(requiredToolForMessage("Analizza Nvidia", { symbol: "NVDA", assetType: "equity" })).toBe("get_company_intelligence");
  });

  it("routes fair value follow-ups through valuation context", () => {
    expect(requiredToolForMessage("Qual è il fair value?", { symbol: "NVDA", assetType: "equity" })).toBe("get_company_intelligence");
  });

  it("routes political activity to the dedicated source", () => {
    expect(requiredToolForMessage("Che stanno facendo i politici?", { symbol: "NVDA", assetType: "equity" })).toBe("get_political_trades");
  });

  it("routes earnings questions to the earnings calendar", () => {
    expect(requiredToolForMessage("Quali sono i prossimi earnings?", { symbol: "NVDA", assetType: "equity" })).toBe("get_earnings");
  });

  it("routes Ethereum analysis through Crypto Intelligence", () => {
    expect(requiredToolForMessage("Analizza Ethereum", { symbol: "ETH-USD", assetType: "crypto" })).toBe("get_crypto_intelligence");
  });

  it("never treats Ethereum as a company with revenue", () => {
    expect(requiredToolForMessage("Dimmi il fatturato di Ethereum", { symbol: "ETH-USD", assetType: "crypto" })).toBe("get_crypto_intelligence");
    expect(KAIRO_ANALYST_PROMPT_V1).toContain("non inventare EPS, EBITDA, fatturato societario");
  });

  it("requires future revenue to be labelled as a projection", () => {
    expect(KAIRO_ANALYST_PROMPT_V1).toContain("Non trattare mai una proiezione come un dato storico");
    expect(KAIRO_ANALYST_PROMPT_V1).toContain("SCENARIO");
  });
});
