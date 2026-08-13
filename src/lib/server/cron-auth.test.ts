import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/schemas/env", () => ({ getServerEnvironment: () => ({ CRON_SECRET: "test-cron-secret" }) }));

describe("cron authorization", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("rejects a missing bearer secret", async () => {
    const { assertCronRequest } = await import("./cron-auth");
    expect(() => assertCronRequest(new Request("https://example.test/api/cron/data-v2"))).toThrow("Cron non autorizzato");
  });

  it("rejects an invalid bearer secret", async () => {
    const { assertCronRequest } = await import("./cron-auth");
    expect(() => assertCronRequest(new Request("https://example.test/api/cron/data-v2", { headers: { authorization: "Bearer wrong" } }))).toThrow("Cron non autorizzato");
  });

  it("accepts the configured bearer secret without exposing it", async () => {
    const { assertCronRequest } = await import("./cron-auth");
    expect(() => assertCronRequest(new Request("https://example.test/api/cron/data-v2", { headers: { authorization: "Bearer test-cron-secret" } }))).not.toThrow();
  });

  it("accepts Vercel's verified automation bypass only in Preview", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "test-preview-bypass");
    const { assertCronRequest } = await import("./cron-auth");
    expect(() => assertCronRequest(new Request("https://example.test/api/cron/data-v2", {
      headers: { "x-vercel-protection-bypass": "test-preview-bypass" },
    }))).not.toThrow();
  });

  it("rejects the automation bypass outside Preview", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "test-preview-bypass");
    const { assertCronRequest } = await import("./cron-auth");
    expect(() => assertCronRequest(new Request("https://example.test/api/cron/data-v2", {
      headers: { "x-vercel-protection-bypass": "test-preview-bypass" },
    }))).toThrow("Cron non autorizzato");
  });

  it("rejects an invalid Preview automation bypass", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "test-preview-bypass");
    const { assertCronRequest } = await import("./cron-auth");
    expect(() => assertCronRequest(new Request("https://example.test/api/cron/data-v2", {
      headers: { "x-vercel-protection-bypass": "wrong" },
    }))).toThrow("Cron non autorizzato");
  });
});
