import { expect, test, type Page } from "@playwright/test";

async function forceVisibleOnline(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
  });
}

test("an already-valid instrument survives ten accelerated minutes of transient quote failures", async ({ page }) => {
  await forceVisibleOnline(page);
  await page.clock.install({ time: new Date() });
  const statuses = ["network", 429, 500, 503, 200] as const;
  let requests = 0;
  let active = 0;
  let maximumActive = 0;
  await page.route("**/api/market/quote?symbol=SPY", async (route) => {
    const status = statuses[requests % statuses.length]!;
    requests += 1;
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    if (status === "network") {
      await route.abort("failed");
    } else if (status === 200) {
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ data: [], meta: {} }) });
    } else {
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ error: { message: "injected transient failure" } }) });
    }
    active -= 1;
  });

  await page.goto("/instrument/nysearca/spy/overview");
  await expect(page.getByRole("heading", { name: /SPDR S&P 500 ETF Trust/i }).first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expect(page.locator('[data-chart-ready="true"]').first()).toBeVisible({ timeout: 10_000 });
  const validPrice = await page.locator(".quote-value").textContent();

  for (let minute = 0; minute < 10; minute += 1) {
    await page.clock.fastForward(60_000);
    await page.waitForTimeout(0);
    await expect(page.getByRole("heading", { name: /SPDR S&P 500 ETF Trust/i }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Market data temporarily unavailable" })).toHaveCount(0);
  }

  expect(await page.locator(".quote-value").textContent()).toBe(validPrice);
  expect(requests).toBeGreaterThan(0);
  expect(requests).toBeLessThanOrEqual(40);
  expect(maximumActive).toBe(1);
});

test("asset analysis routes resolve independently without a global fallback", async ({ page }) => {
  for (const [route, heading] of [
    ["/instrument/nasdaqgs/nvda/analysis", "Company Intelligence"],
    ["/instrument/nysearca/spy/analysis", "ETF INTELLIGENCE"],
    ["/instrument/crypto/eth-usd/analysis", "CRYPTO INTELLIGENCE"],
  ] as const) {
    const startedAt = Date.now();
    await page.goto(route, { waitUntil: "domcontentloaded" });
    const shellMs = Date.now() - startedAt;
    await expect(page.getByText(heading, { exact: true })).toBeVisible({ timeout: 15_000 });
    const coreMs = Date.now() - startedAt;
    await expect(page.getByRole("heading", { name: "Market data temporarily unavailable" })).toHaveCount(0);
    expect(coreMs).toBeLessThan(15_000);
    console.log(JSON.stringify({ event: "analysis_performance", route, shellMs, coreMs }));
  }
});
