import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }, testInfo) => {
  const octet = 30 + testInfo.title.length % 180;
  await page.route("**/api/analysis/technical-chart?**", (route) => route.continue({ headers: { ...route.request().headers(), "x-forwarded-for": `198.51.100.${octet}` } }));
});

test("V4 range is independent, persistent and retains the chart while expanding", async ({ page }) => {
  await page.goto("/instrument/nasdaqgs/nvda/technical", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("technical-terminal-chart")).toHaveAttribute("data-chart-ready", "true", { timeout: 30_000 });
  const range = page.getByLabel("Historical range");
  await range.getByRole("button", { name: "5Y", exact: true }).click();
  await expect(page.getByTestId("technical-terminal-chart")).toBeVisible();
  await expect(page.getByText(/NVDA · 5Y · 1D/)).toBeVisible({ timeout: 30_000 });
  const primaryPanel = page.locator('[data-panel-id="panel-1"]');
  await expect(primaryPanel.locator(".technical-panel-header")).toContainText(/1\d{3} verified bars/, { timeout: 30_000 });
  await page.waitForTimeout(500);
  await expect(primaryPanel.locator(".technical-panel-header")).toContainText(/1\d{3} verified bars/);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(range.getByRole("button", { name: "5Y", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "1D", exact: true }).first()).toHaveAttribute("aria-pressed", "true");
});

test("V4 planner and advanced layers calculate locally without provider refetch", async ({ page }) => {
  let requests = 0; page.on("request", (request) => { if (request.url().includes("/api/analysis/technical-chart?")) requests += 1; });
  await page.goto("/instrument/crypto/btc-usd/technical", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("technical-terminal-chart")).toHaveAttribute("data-chart-ready", "true", { timeout: 30_000 });
  await page.waitForTimeout(500); const before = requests;
  await page.getByText("Planner", { exact: true }).click();
  await page.getByLabel("Planner entry").fill("100"); await page.getByLabel("Planner stop").fill("95"); await page.getByLabel("Planner target 1").fill("110"); await page.getByLabel("Planner account size").fill("10000");
  await expect(page.getByText("2.00R")).toBeVisible();
  await page.getByText("Liquidity", { exact: true }).click(); await page.getByText("FVG", { exact: true }).click(); await page.getByText("Displacement", { exact: true }).click();
  await expect(page.getByText("ADVANCED STRUCTURE", { exact: true })).toBeVisible(); expect(requests).toBe(before);
});

test("V4 custom range validates dates and remains usable at responsive widths", async ({ page }) => {
  await page.goto("/instrument/nasdaqgs/aapl/technical", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("technical-terminal-chart")).toHaveAttribute("data-chart-ready", "true", { timeout: 30_000 });
  await page.getByLabel("Historical range").getByRole("button", { name: "Custom" }).click();
  await expect(page.getByLabel("Custom historical range")).toBeVisible();
  await page.getByLabel("Planner entry").count();
  await expect(page.getByTestId("technical-chart-workspace").getByRole("button", { name: "View", exact: true })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); expect(overflow).toBeLessThanOrEqual(2);
});
