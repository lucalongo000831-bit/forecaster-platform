import { expect, test, type Page } from "@playwright/test";

const dashboardHeading = /Good afternoon/i;

async function forceVisibleOnline(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
  });
}

test("failed dashboard probe preserves the render and the next safe cycle recovers", async ({ page }) => {
  await forceVisibleOnline(page);
  await page.clock.install({ time: new Date("2026-09-04T10:00:00.000Z") });
  const criticalErrors: string[] = [];
  let probes = 0;
  let activeProbes = 0;
  let maximumActiveProbes = 0;
  page.on("console", (message) => {
    if (message.type() === "error" && /AbortError|ChunkLoadError|unhandled|React|hydration/i.test(message.text())) {
      criticalErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => criticalErrors.push(error.message));
  await page.route("**/api/health/live", async (route) => {
    probes += 1;
    activeProbes += 1;
    maximumActiveProbes = Math.max(maximumActiveProbes, activeProbes);
    if (probes === 1) {
      await route.fulfill({ status: 302, headers: { Location: "/vercel-sso-login" } });
    } else {
      await route.fulfill({ status: 204, headers: { "Cache-Control": "no-store" } });
    }
    activeProbes -= 1;
  });

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: dashboardHeading })).toBeVisible();
  await page.clock.fastForward(30_000);
  await expect.poll(() => probes).toBe(1);
  await expect(page.getByRole("heading", { name: dashboardHeading })).toBeVisible();

  await page.clock.fastForward(30_000);
  await expect.poll(() => probes).toBe(2);
  await expect(page.getByRole("heading", { name: dashboardHeading })).toBeVisible();
  expect(maximumActiveProbes).toBe(1);
  expect(criticalErrors).toEqual([]);
});

test("dashboard reconnect events cannot overlap an active probe", async ({ page }) => {
  await forceVisibleOnline(page);
  await page.clock.install({ time: new Date("2026-09-04T10:00:00.000Z") });
  let probes = 0;
  let activeProbes = 0;
  let maximumActiveProbes = 0;
  let release: (() => void) | undefined;
  await page.route("**/api/health/live", async (route) => {
    probes += 1;
    activeProbes += 1;
    maximumActiveProbes = Math.max(maximumActiveProbes, activeProbes);
    await new Promise<void>((resolve) => { release = resolve; });
    await route.fulfill({ status: 204, headers: { "Cache-Control": "no-store" } });
    activeProbes -= 1;
  });

  await page.goto("/dashboard");
  await page.clock.fastForward(30_000);
  await expect.poll(() => probes).toBe(1);
  await page.evaluate(() => {
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("online"));
  });

  expect(probes).toBe(1);
  expect(maximumActiveProbes).toBe(1);
  release?.();
  await expect(page.getByRole("heading", { name: dashboardHeading })).toBeVisible();
});

test("visibility pause performs no network work and resumes exactly once", async ({ page }) => {
  await page.addInitScript(() => {
    let hidden = true;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
    (window as Window & { setAuditHidden?: (value: boolean) => void }).setAuditHidden = (value) => {
      hidden = value;
      document.dispatchEvent(new Event("visibilitychange"));
    };
  });
  await page.clock.install({ time: new Date("2026-09-04T10:00:00.000Z") });
  let probes = 0;
  await page.route("**/api/health/live", async (route) => {
    probes += 1;
    await route.fulfill({ status: 204, headers: { "Cache-Control": "no-store" } });
  });

  await page.goto("/dashboard");
  await page.clock.fastForward(360_000);
  expect(probes).toBe(0);
  await page.evaluate(() => (window as Window & { setAuditHidden?: (value: boolean) => void }).setAuditHidden?.(false));
  await expect.poll(() => probes).toBe(1);
  await expect(page.getByRole("heading", { name: dashboardHeading })).toBeVisible();
});

test("route navigation leaves exactly one dashboard scheduler", async ({ page }) => {
  await forceVisibleOnline(page);
  await page.clock.install({ time: new Date("2026-09-04T10:00:00.000Z") });
  let probes = 0;
  await page.route("**/api/health/live", async (route) => {
    probes += 1;
    await route.fulfill({ status: 204, headers: { "Cache-Control": "no-store" } });
  });

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: dashboardHeading })).toBeVisible();
  await page.goto("/instrument/nasdaqgs/nvda/technical", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Technical chart", exact: true })).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: dashboardHeading })).toBeVisible();
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: /Make Kairo yours/i })).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: dashboardHeading })).toBeVisible();

  const beforeCycle = probes;
  await page.clock.fastForward(30_000);
  await expect.poll(() => probes).toBe(beforeCycle + 1);
});

test("canonical settings check detects invalidation and explicit logout still navigates", async ({ page }) => {
  let sessionActive = true;
  let logoutRequests = 0;
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: sessionActive ? {
        id: "audit-user",
        email: "audit@example.com",
        name: "Audit User",
        role: "USER",
      } : null }),
    });
  });
  await page.route("**/api/auth/logout", async (route) => {
    logoutRequests += 1;
    sessionActive = false;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { loggedOut: true } }) });
  });

  await page.goto("/settings");
  await expect(page.locator('input[value="audit@example.com"]')).toBeVisible();

  sessionActive = false;
  await page.reload();
  await expect(page.getByText("No active session")).toBeVisible();

  sessionActive = true;
  await page.reload();
  await expect(page.locator('input[value="audit@example.com"]')).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(logoutRequests).toBe(1);
});
