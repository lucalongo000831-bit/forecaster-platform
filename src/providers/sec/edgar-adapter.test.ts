import { describe, expect, it } from "vitest";

// server-only is aliased to an empty module by the Vitest configuration.
import { __test } from "./edgar-adapter";

function fact(rows: Array<Record<string, unknown>>) {
  return { units: { USD: rows } };
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
});
