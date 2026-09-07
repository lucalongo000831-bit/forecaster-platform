import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  cookieSet: vi.fn(),
  cookieDelete: vi.fn(),
  getDatabase: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: mocks.cookieGet,
    set: mocks.cookieSet,
    delete: mocks.cookieDelete,
  })),
}));

vi.mock("@/db/client", () => ({ getDatabase: mocks.getDatabase }));
vi.mock("@/schemas/env", () => ({ getServerEnvironment: () => ({ AUTH_SECRET: "x".repeat(32) }) }));

import { createSession, destroySession, getCurrentUser } from "./auth";

function sessionLookup(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn(() => ({ limit }));
  const innerJoin = vi.fn(() => ({ where }));
  const from = vi.fn(() => ({ innerJoin }));
  const select = vi.fn(() => ({ from }));
  return { database: { select }, where };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("canonical Kairo session lifecycle", () => {
  it("does not resolve a missing session cookie", async () => {
    mocks.cookieGet.mockReturnValue(undefined);

    await expect(getCurrentUser()).resolves.toBeNull();
    expect(mocks.getDatabase).not.toHaveBeenCalled();
  });

  it("treats an invalidated or expired database session as unauthenticated", async () => {
    mocks.cookieGet.mockReturnValue({ value: "opaque-browser-token" });
    const { database } = sessionLookup([]);
    mocks.getDatabase.mockReturnValue(database);

    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("keeps cookie and database expiry aligned at thirty days", async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn(() => ({ values }));
    mocks.getDatabase.mockReturnValue({ insert });
    const before = Date.now();

    await createSession("user-1", "audit-agent");

    const inserted = values.mock.calls[0]?.[0] as { expiresAt: Date };
    const thirtyDaysSeconds = 60 * 60 * 24 * 30;
    expect(inserted.expiresAt.getTime()).toBeGreaterThanOrEqual(before + thirtyDaysSeconds * 1_000);
    expect(inserted.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + thirtyDaysSeconds * 1_000);
    expect(mocks.cookieSet).toHaveBeenCalledWith("kairo_session", expect.any(String), expect.objectContaining({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: thirtyDaysSeconds,
    }));
  });

  it("deletes both the database session and browser cookie on logout", async () => {
    mocks.cookieGet.mockReturnValue({ value: "opaque-browser-token" });
    const where = vi.fn().mockResolvedValue(undefined);
    const remove = vi.fn(() => ({ where }));
    mocks.getDatabase.mockReturnValue({ delete: remove });

    await destroySession();

    expect(remove).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenCalledTimes(1);
    expect(mocks.cookieDelete).toHaveBeenCalledWith("kairo_session");
  });
});
