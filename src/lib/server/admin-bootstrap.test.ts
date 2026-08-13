import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getDatabase: vi.fn(), getServerEnvironment: vi.fn() }));
vi.mock("@/db", () => ({ getDatabase: mocks.getDatabase, users: { id: "id", email: "email", role: "role", name: "name", updatedAt: "updatedAt" } }));
vi.mock("@/schemas/env", () => ({ getServerEnvironment: mocks.getServerEnvironment }));

import { bootstrapConfiguredAdministrator } from "./admin-bootstrap";

const user = { id: "user-1", email: "admin@example.test", name: "Admin", role: "USER" as const };
describe("administrator bootstrap", () => {
  beforeEach(() => { mocks.getDatabase.mockReset(); mocks.getServerEnvironment.mockReset(); });
  it("rejects an authenticated account not selected by server configuration", async () => { mocks.getServerEnvironment.mockReturnValue({ KAIRO_BOOTSTRAP_ADMIN_EMAIL: "other@example.test" }); await expect(bootstrapConfiguredAdministrator(user)).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(mocks.getDatabase).not.toHaveBeenCalled(); });
  it("is idempotent when the configured account is already an administrator", async () => {
    mocks.getServerEnvironment.mockReturnValue({ KAIRO_BOOTSTRAP_ADMIN_EMAIL: user.email });
    const select = vi.fn().mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [{ ...user, role: "ADMIN" }] }) }) });
    mocks.getDatabase.mockReturnValue({ transaction: (callback: (transaction: { execute: () => Promise<void>; select: typeof select }) => unknown) => callback({ execute: async () => undefined, select }) });
    await expect(bootstrapConfiguredAdministrator(user)).resolves.toMatchObject({ status: "ALREADY_ADMIN", user: { role: "ADMIN" } });
  });
});
