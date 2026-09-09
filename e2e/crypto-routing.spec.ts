import { expect, test } from "@playwright/test";

test("search opens ETH and BTC through canonical crypto routes", async ({ page }) => {
  await page.goto("/search", { waitUntil: "load" });
  const search = page.getByPlaceholder("Search company, symbol or theme");

  const ethResponse = page.waitForResponse((response) => response.url().includes("/api/market/search?q=ETH"));
  await search.fill("ETH");
  expect((await ethResponse).status()).toBe(200);
  const eth = page.getByRole("row").filter({ hasText: "ETH-USD" });
  await expect(eth).toContainText("Crypto");
  await expect(eth.getByRole("link", { name: "Open" })).toHaveAttribute("href", "/instrument/crypto/eth-usd/overview");
  await eth.getByRole("link", { name: "Open" }).click();
  await expect(page).toHaveURL(/\/instrument\/crypto\/eth-usd\/overview$/);
  await expect(page.getByRole("heading", { name: "Ethereum USD", exact: true })).toBeVisible();

  await page.goto("/search", { waitUntil: "load" });
  const btcResponse = page.waitForResponse((response) => response.url().includes("/api/market/search?q=BTC"));
  await page.getByPlaceholder("Search company, symbol or theme").fill("BTC");
  expect((await btcResponse).status()).toBe(200);
  const btc = page.getByRole("row").filter({ hasText: "BTC-USD" });
  await expect(btc).toContainText("Crypto");
  await expect(btc.getByRole("link", { name: "Open" })).toHaveAttribute("href", "/instrument/crypto/btc-usd/overview");
  await btc.getByRole("link", { name: "Open" }).click();
  await expect(page).toHaveURL(/\/instrument\/crypto\/btc-usd\/overview$/);
  await expect(page.getByRole("heading", { name: "Bitcoin USD", exact: true })).toBeVisible();
});

test("legacy .CC routes redirect once and preserve crypto sections", async ({ page, request }) => {
  const legacyResponse = await request.get("/instrument/cc/eth-usd.cc/overview?source=bookmark", { maxRedirects: 0 });
  expect(legacyResponse.status()).toBe(308);
  const location = new URL(legacyResponse.headers().location!, "http://kairo.test");
  expect(`${location.pathname}${location.search}`).toBe("/instrument/crypto/eth-usd/overview?source=bookmark");

  await page.goto("/instrument/cc/eth-usd.cc/overview", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/instrument\/crypto\/eth-usd\/overview$/);
  await expect(page.getByRole("heading", { name: "Ethereum USD", exact: true })).toBeVisible();

  await page.goto("/instrument/cc/eth-usd.cc/technical?layout=4", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/instrument\/crypto\/eth-usd\/technical\?layout=4$/);
  await expect(page.getByText("Market Structure", { exact: true })).toBeVisible();

  await page.goto("/instrument/cc/eth-usd.cc/pattern", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/instrument\/crypto\/eth-usd\/pattern$/);
  await expect(page.getByRole("heading", { name: "Pattern Intelligence", exact: true })).toBeVisible();

  await page.goto("/instrument/cc/eth-usd.cc/seasonality", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/instrument\/crypto\/eth-usd\/seasonality$/);
  await expect(page.getByRole("heading", { name: "Seasonality intelligence", exact: true })).toBeVisible();
});

test("equity and ETF routes remain unchanged", async ({ page }) => {
  for (const [path, heading] of [
    ["/instrument/nasdaq/nvda/overview", "NVIDIA Corporation"],
    ["/instrument/mil/stlam.mi/overview", "Stellantis N.V."],
    ["/instrument/nysearca/spy/overview", "SPDR S&P 500 ETF Trust"],
  ] as const) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }
});
