import { expect, test, type Page, type Route } from "@playwright/test";

type Item = {
  id: string; symbol: string; name: string; type: string; currency: string; market: string;
  position: number; notes: null; price: null; changePercent: null; volume: null; marketState: null;
  lastUpdated: null; provider: null; signal: null; confidence: null; target: null; nextEvent: null; activeAlerts: number;
};

const listId = "10000000-0000-4000-8000-000000000001";

function item(symbol: string, name = symbol): Item {
  return { id: crypto.randomUUID(), symbol, name, type: symbol.endsWith("-USD") ? "CRYPTO" : symbol === "SPY" ? "ETF" : "EQUITY", currency: symbol === "STLAM.MI" ? "EUR" : "USD", market: symbol.endsWith("-USD") ? "CCC" : symbol === "STLAM.MI" ? "MIL" : "NASDAQ", position: 0, notes: null, price: null, changePercent: null, volume: null, marketState: null, lastUpdated: null, provider: null, signal: null, confidence: null, target: null, nextEvent: null, activeAlerts: 0 };
}

async function mockAccount(page: Page, initial: Item[] = []) {
  const items = [...initial];
  await page.route("**/api/auth/session", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { id: "test-user" } }) }));
  await page.route("**/api/account/watchlists**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const itemMatch = url.pathname.match(/\/watchlists\/[^/]+\/items\/([^/]+)$/);
    if (method === "GET" && url.pathname.endsWith("/watchlists")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [{ id: listId, name: "My Watchlist", description: null, items }] }) });
    }
    if (method === "POST" && url.pathname.endsWith("/items")) {
      const payload = request.postDataJSON() as { symbol: string; name: string };
      const existing = items.find((entry) => entry.symbol === payload.symbol);
      const created = existing ?? item(payload.symbol, payload.name);
      if (!existing) items.push(created);
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ data: { id: created.id } }) });
    }
    if (method === "DELETE" && itemMatch) {
      const index = items.findIndex((entry) => entry.id === itemMatch[1]);
      if (index >= 0) items.splice(index, 1);
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { deleted: true } }) });
    }
    return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: { message: "Unhandled test route" } }) });
  });
  return items;
}

const searchRows: Record<string, { symbol: string; name: string; type: "Stock" | "ETF" | "Crypto"; venue: string; href: string }> = {
  NVDA: { symbol: "NVDA", name: "NVIDIA", type: "Stock", venue: "NASDAQ", href: "/instrument/nasdaq/nvda/overview" },
  AAPL: { symbol: "AAPL", name: "Apple", type: "Stock", venue: "NASDAQ", href: "/instrument/nasdaq/aapl/overview" },
  SPY: { symbol: "SPY", name: "SPDR S&P 500", type: "ETF", venue: "NYSE", href: "/instrument/nyse/spy/overview" },
  "STLAM.MI": { symbol: "STLAM.MI", name: "Stellantis", type: "Stock", venue: "MIL", href: "/instrument/milan/stlam.mi/overview" },
  BTC: { symbol: "BTC", name: "Bitcoin", type: "Crypto", venue: "CC", href: "/instrument/cc/btc/overview" },
  ETH: { symbol: "ETH.CC", name: "Ether", type: "Crypto", venue: "CC", href: "/instrument/cc/eth.cc/overview" },
};

test("watchlist search stays responsive, canonicalizes assets, adds and removes", async ({ page }) => {
  const items = await mockAccount(page);
  await page.route("**/api/market/search?**", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("q")?.toUpperCase() ?? "";
    const row = searchRows[query];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: row ? [{ ...row, price: 1, currency: query === "STLAM.MI" ? "EUR" : "USD" }, { ...row, price: 1 }] : [] }) });
  });
  await page.goto("/watchlists");
  await page.getByRole("button", { name: "Add instrument" }).click();
  const search = page.getByPlaceholder("AAPL, ENI.MI, Bitcoin…");
  for (const query of ["NVDA", "AAPL", "SPY", "STLAM.MI", "BTC", "ETH"]) {
    await search.fill(query);
    await expect(page.getByText(new RegExp(query.startsWith("BTC") ? "BTC-USD" : query.startsWith("ETH") ? "ETH-USD" : query.replace(".", "\\.")))).toBeVisible();
    await expect(page.getByRole("button", { name: "Add to watchlist" })).toBeEnabled();
  }
  await page.getByRole("button", { name: "Add to watchlist" }).click();
  await expect(page.getByRole("button", { name: "Remove ETH-USD" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ether" })).toHaveAttribute("href", "/instrument/crypto/eth-usd/overview");
  expect(items.map((entry) => entry.symbol)).toEqual(["ETH-USD"]);
  await page.getByRole("button", { name: "Remove ETH-USD" }).click();
  await expect(page.getByText("Create your first private watchlist.")).not.toBeVisible();
  expect(items).toEqual([]);
});

test("search failures remain local and preserve verified results", async ({ page }) => {
  await mockAccount(page);
  await page.route("**/api/market/search?**", (route) => route.fulfill({ status: 500, contentType: "application/json", body: "{}" }));
  await page.goto("/watchlists");
  await page.getByRole("button", { name: "Add instrument" }).click();
  await page.getByPlaceholder("AAPL, ENI.MI, Bitcoin…").fill("NVDA");
  await expect(page.getByText("Ricerca temporaneamente non disponibile. Riprova.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Add instrument" })).toBeVisible();
  await expect(page.getByText(/NVDA/).first()).toBeVisible();
});

test("instrument Watch persists, exposes pending state, and removes", async ({ page }) => {
  const items = await mockAccount(page);
  await page.goto("/instrument/nasdaqgs/nvda/overview");
  const add = page.getByRole("button", { name: "Add to watchlist" });
  await expect(add).toBeVisible();
  await add.click();
  await expect(page.getByRole("button", { name: "Remove from watchlist" })).toBeVisible();
  expect(items.map((entry) => entry.symbol)).toEqual(["NVDA"]);
  await page.reload();
  await expect(page.getByRole("button", { name: "Remove from watchlist" })).toBeVisible();
  await page.getByRole("button", { name: "Remove from watchlist" }).click();
  await expect(page.getByRole("button", { name: "Add to watchlist" })).toBeVisible();
  expect(items).toEqual([]);
});
