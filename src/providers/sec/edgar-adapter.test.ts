import { describe, expect, it } from "vitest";

// server-only is aliased to an empty module by the Vitest configuration.
import { __test } from "./edgar-adapter";

function fact(rows: Array<Record<string, unknown>>) {
  return { units: { USD: rows } };
}

function eurFact(rows: Array<Record<string, unknown>>) {
  return { units: { EUR: rows } };
}

describe("SEC EDGAR concept aliases", () => {
  it("keeps observations from successor XBRL concepts", () => {
    const facts = {
      PaymentsToAcquirePropertyPlantAndEquipment: fact([{ end: "2020-01-31", val: 10, filed: "2020-02-20", form: "10-K", fp: "FY" }]),
      PaymentsToAcquireProductiveAssets: fact([{ end: "2025-01-31", val: 25, filed: "2025-02-20", form: "10-K", fp: "FY" }]),
    };

    const rows = __test.observations(facts, ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"]);

    expect(rows.map((row) => row.end)).toEqual(["2020-01-31", "2025-01-31"]);
  });

  it("normalizes IFRS annual facts and excludes interim facts embedded in a 20-F", () => {
    const annual = { start: "2025-01-01", end: "2025-12-31", filed: "2026-02-26", form: "20-F", fp: "FY", accn: "0001605484-26-000021" };
    const facts = {
      Revenue: eurFact([{ ...annual, val: 153_508 }]),
      CostOfSales: eurFact([{ ...annual, val: 155_627 }]),
      ProfitLossFromOperatingActivities: eurFact([{ ...annual, val: -26_254 }]),
      AdjustmentsForDepreciationAndAmortisationExpense: eurFact([{ ...annual, val: 6_981 }]),
      PurchaseOfTreasuryShares: eurFact([
        { start: "2025-01-01", end: "2025-12-31", filed: "2026-02-26", form: "20-F", fp: "FY", val: 3_000, accn: annual.accn },
        { start: "2025-08-01", end: "2025-10-31", filed: "2026-02-26", form: "20-F", fp: "FY", val: 1_000, accn: annual.accn },
      ]),
    };
    const namespaces = Object.fromEntries(Object.keys(facts).map((key) => [key, "ifrs-full"]));
    const income = __test.buildStatements("0001605484", facts, namespaces, "income", "annual", 10);
    const cashFlow = __test.buildStatements("0001605484", facts, namespaces, "cash-flow", "annual", 10);

    expect(income).toHaveLength(1);
    expect(income[0]?.values.grossProfit).toBe(-2_119);
    expect(income[0]?.values.ebitda).toBe(-19_273);
    expect(income[0]?.lineage?.revenue?.sourceConcept).toBe("ifrs-full:Revenue");
    expect(cashFlow.map((row) => row.fiscalDate)).toEqual(["2025-12-31"]);
    expect(cashFlow[0]?.values.commonStockRepurchased).toBe(-3_000);
  });
});
