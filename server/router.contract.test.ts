import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));

vi.mock("./db", () => ({
  getDb: mocks.getDb,
  getOperationalSummary: vi.fn(),
  getOrganizationForUser: vi.fn(),
  getOrganizationIdForUser: vi.fn(),
  listCustomers: vi.fn(),
  listInventory: vi.fn(),
  listOrders: vi.fn(),
  listProducts: vi.fn(),
  listStores: vi.fn(),
  listVariants: vi.fn(),
}));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const user = {
  id: 7,
  openId: "contract-user",
  name: "Test User",
  email: "test@example.com",
  loginMethod: "test",
  role: "user" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

function caller() {
  return appRouter.createCaller({
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  });
}

function query(rows: unknown[]) {
  return { from: () => ({ where: () => ({ limit: async () => rows }) }) };
}

describe("protected tRPC contracts", () => {
  it("returns SERVICE_UNAVAILABLE when the database is unavailable", async () => {
    mocks.getDb.mockResolvedValueOnce(null);
    await expect(caller().organization.create({ name: "Atelier", slug: "atelier" })).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });

  it("returns PRECONDITION_FAILED when no organization is attached", async () => {
    mocks.getDb.mockResolvedValueOnce({ select: vi.fn().mockReturnValue(query([])) });
    await expect(caller().stores.list()).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("allows a manager to deactivate only a store in the current tenant", async () => {
    const db = {
      select: vi.fn().mockReturnValue(query([{ organizationId: 10, role: "manager" }])),
      update: vi.fn().mockReturnValue({ set: () => ({ where: async () => undefined }) }),
    };
    mocks.getDb.mockResolvedValue(db);
    await expect(caller().stores.deactivate({ id: 4 })).resolves.toEqual({ success: true });
    expect(db.update).toHaveBeenCalled();
  });

  it("allows a manager to adjust inventory through the protected procedure", async () => {
    const db = {
      select: vi.fn().mockReturnValue(query([{ organizationId: 10, role: "manager" }])),
      update: vi.fn().mockReturnValue({ set: () => ({ where: async () => undefined }) }),
    };
    mocks.getDb.mockResolvedValue(db);
    await expect(caller().inventory.adjust({ id: 3, quantity: 12 })).resolves.toEqual({ success: true });
    expect(db.update).toHaveBeenCalled();
  });

  it("rejects an order referencing a store outside the current tenant", async () => {
    const db = {
      select: vi.fn()
        .mockReturnValueOnce(query([{ organizationId: 10, role: "manager" }]))
        .mockReturnValueOnce(query([])),
      insert: vi.fn(),
    };
    mocks.getDb.mockResolvedValueOnce(db);
    await expect(caller().orders.create({ storeId: 99, customerId: 1, reference: "CMD-001", totalAmount: "10000" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.insert).not.toHaveBeenCalled();
  });
});
