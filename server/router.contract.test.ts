import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getOrganizationIdForUser: vi.fn(),
}));

vi.mock("./db", () => ({
  getDb: mocks.getDb,
  getOrganizationIdForUser: mocks.getOrganizationIdForUser,
  getOrganizationForUser: vi.fn(),
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
  listStores: vi.fn(async () => []),
  listCustomers: vi.fn(async () => []),
  listProducts: vi.fn(async () => []),
  listInventory: vi.fn(async () => []),
  listVariants: vi.fn(async () => []),
  listOrders: vi.fn(async () => []),
  listSales: vi.fn(async () => []),
  getOperationalSummary: vi.fn(async () => ({})),
  closeDatabase: vi.fn(),
  migrateDatabase: vi.fn(),
  isPglite: vi.fn(() => false),
}));

import { appRouter } from "./routers";
import { requireOrganization } from "./guards";
import type { TrpcContext } from "./_core/context";

const baseUser = {
  id: 7,
  openId: "contract-user",
  email: "test@example.com",
  name: "Test User",
  loginMethod: "local",
  role: "user" as const,
  passwordHash: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

function caller(role: "user" | "admin" = "user") {
  const user = { ...baseUser, role };
  return appRouter.createCaller({
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  });
}

describe("protected tRPC contracts", () => {
  it("returns SERVICE_UNAVAILABLE when the database is unavailable", async () => {
    mocks.getDb.mockResolvedValueOnce(null);
    await expect(caller().organization.requestSubscription({ plan: "boutique", months: 1 })).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    });
  });

  it("returns PRECONDITION_FAILED when no organization is attached", async () => {
    mocks.getDb.mockResolvedValue({
      select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) }) }),
    });
    await expect(caller().stores.list()).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("requires an authenticated user for protected procedures", async () => {
    const unauthed = appRouter.createCaller({
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    });
    await expect(unauthed.dashboard.summary()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("hides the ENVOL administration from regular users", async () => {
    await expect(caller("user").admin.stats()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller("user").admin.organizations()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("scopes requireOrganization to the caller's membership and role", async () => {
    mocks.getDb.mockResolvedValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ organizationId: 10, role: "manager" }]),
          }),
        }),
      }),
    });
    await expect(requireOrganization(baseUser.id, ["owner"])).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(requireOrganization(baseUser.id, ["owner", "manager"])).resolves.toEqual({ organizationId: 10, role: "manager" });
  });
});
