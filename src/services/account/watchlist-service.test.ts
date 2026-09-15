import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDatabase: vi.fn(), quotes: vi.fn(), signal: vi.fn(), target: vi.fn(),
  table: new Proxy({}, { get: (_target, property) => String(property) }),
}));

vi.mock("drizzle-orm", () => ({
  and: (...values: unknown[]) => values, asc: (value: unknown) => value, count: () => "count",
  eq: (...values: unknown[]) => values, gte: (...values: unknown[]) => values, inArray: (...values: unknown[]) => values,
}));
vi.mock("@/db", () => ({
  alerts: mocks.table, calendarEvents: mocks.table, instruments: mocks.table, watchlistItems: mocks.table, watchlists: mocks.table,
  getDatabase: mocks.getDatabase,
}));
vi.mock("@/providers", () => ({ financialProviderRouter: { quotes: mocks.quotes } }));
vi.mock("@/services/analysis/signal-service", () => ({ getSignalAnalysis: mocks.signal }));
vi.mock("@/services/analysis/target-service", () => ({ getTargetAnalysis: mocks.target }));
vi.mock("./instrument-repository", () => ({ ensureInstrument: vi.fn() }));

import { listWatchlists } from "./watchlist-service";

function databaseFixture() {
  const lists = [{ id: "list-1", userId: "user-1", name: "Primary", description: null, createdAt: new Date(), updatedAt: new Date() }];
  const rows = [{ id: "item-1", watchlistId: "list-1", instrumentId: "instrument-1", position: 0, notes: null, symbol: "NVDA", name: "NVIDIA", type: "EQUITY", currency: "USD", market: "NASDAQ" }];
  const select = vi.fn()
    .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => lists }) }) })
    .mockReturnValueOnce({ from: () => ({ innerJoin: () => ({ where: () => ({ orderBy: async () => rows }) }) }) });
  return { select };
}

beforeEach(() => vi.clearAllMocks());

describe("authenticated watchlist bootstrap", () => {
  it("returns persisted identity without waiting for optional market enrichment", async () => {
    mocks.getDatabase.mockReturnValue(databaseFixture());

    await expect(listWatchlists("user-1", { enrich: false })).resolves.toEqual([{
      id: "list-1", name: "Primary", description: null,
      items: [expect.objectContaining({ id: "item-1", symbol: "NVDA", market: "NASDAQ", price: null, signal: null })],
    }]);
    expect(mocks.quotes).not.toHaveBeenCalled();
    expect(mocks.signal).not.toHaveBeenCalled();
    expect(mocks.target).not.toHaveBeenCalled();
  });
});
