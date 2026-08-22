import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { deterministicE2ENetworkAudit, installDeterministicE2EProviderNetworkGuard } from "./provider-network-audit";

const originalFetch = globalThis.fetch;

describe("deterministic E2E provider network guard", () => {
  beforeAll(() => {
    vi.stubEnv("KAIRO_E2E_PROVIDER_FIXTURES", "true");
    vi.stubEnv("KAIRO_E2E_RUN", "playwright");
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
    globalThis.fetch = vi.fn(async () => new Response("ok"));
    installDeterministicE2EProviderNetworkGuard();
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it("fails immediately before an unexpected financial-provider request leaves the process", async () => {
    await expect(fetch("https://query1.finance.yahoo.com/v8/finance/chart/NVDA")).rejects.toThrow(/blocked an unexpected provider request/i);
    expect(deterministicE2ENetworkAudit()).toMatchObject({ enabled: true, installed: true, blockedAttempts: 1, hosts: { "query1.finance.yahoo.com": 1 } });
  });

  it("does not block localhost application requests", async () => {
    await expect(fetch("http://127.0.0.1:3000/api/market/quote?symbol=NVDA")).resolves.toBeInstanceOf(Response);
  });
});
