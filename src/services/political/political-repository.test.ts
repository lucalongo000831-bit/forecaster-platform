import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDatabase: vi.fn(),
  isDatabaseConfigured: vi.fn(),
  structuredLog: vi.fn(),
}));

vi.mock("@/db", () => ({
  getDatabase: mocks.getDatabase,
  isDatabaseConfigured: mocks.isDatabaseConfigured,
  politicalFilings: {},
  politicalHistoryMonths: { month: "month" },
  politicalSyncStates: { key: "key" },
  politicalTransactions: {},
  politicalTransactionSources: {},
  politicians: {},
  instruments: {},
}));
vi.mock("@/lib/server/logger", () => ({ structuredLog: mocks.structuredLog }));
vi.mock("./political-asset-resolver", () => ({ ensurePoliticalAssetContext: vi.fn(), resolvePoliticalAssetContext: vi.fn() }));
vi.mock("@/services/instruments/instrument-kind", () => ({ verifiedInstrumentKind: vi.fn() }));

import { getPoliticalSyncHealth } from "./political-repository";

describe("political persistence health", () => {
  beforeEach(() => {
    mocks.getDatabase.mockReset();
    mocks.isDatabaseConfigured.mockReset();
    mocks.structuredLog.mockReset();
  });

  it("reports runtime-only mode when persistence is not configured", async () => {
    mocks.isDatabaseConfigured.mockReturnValue(false);

    await expect(getPoliticalSyncHealth()).resolves.toMatchObject({
      databaseConfigured: false,
      databaseStatus: "NOT_CONFIGURED",
      fmpStatus: "RUNTIME_ONLY",
    });
  });

  it("degrades cleanly when the Preview database schema is unavailable", async () => {
    mocks.isDatabaseConfigured.mockReturnValue(true);
    mocks.getDatabase.mockImplementation(() => { throw new Error("schema unavailable"); });

    await expect(getPoliticalSyncHealth()).resolves.toMatchObject({
      databaseConfigured: true,
      databaseStatus: "UNAVAILABLE",
      fmpStatus: "RUNTIME_ONLY",
    });
    expect(mocks.structuredLog).toHaveBeenCalledWith("warn", "political.health.persistence_unavailable", { errorType: "Error" });
  });
});
