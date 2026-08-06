import { describe, expect, it } from "vitest";
import { calculateLedger } from "./ledger";

const trade = (type: "BUY" | "SELL", quantity: number, price: number, day: number, fees = 0) => ({ instrumentId: "asset", type, quantity, price, fees, executedAt: `2026-01-${String(day).padStart(2, "0")}T10:00:00.000Z` });

describe("calculateLedger", () => {
  it("uses a weighted average and realizes long gains", () => {
    const [position] = calculateLedger([trade("BUY", 10, 100, 1), trade("BUY", 10, 120, 2), trade("SELL", 5, 130, 3, 2)]);
    expect(position.quantity).toBe(15);
    expect(position.averagePrice).toBe(110);
    expect(position.realizedPnl).toBe(98);
  });

  it("supports short positions and covers", () => {
    const [position] = calculateLedger([trade("SELL", 10, 100, 1), trade("BUY", 4, 80, 2)]);
    expect(position.quantity).toBe(-6);
    expect(position.averagePrice).toBe(100);
    expect(position.realizedPnl).toBe(80);
  });

  it("adjusts quantity and cost basis for splits", () => {
    const [position] = calculateLedger([trade("BUY", 5, 200, 1), { instrumentId: "asset", type: "SPLIT", quantity: 4, price: null, fees: 0, executedAt: "2026-01-02T10:00:00.000Z" }]);
    expect(position.quantity).toBe(20);
    expect(position.averagePrice).toBe(50);
  });
});
