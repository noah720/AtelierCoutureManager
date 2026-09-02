import { describe, expect, it } from "vitest";
import { customers, inventory, orders, products, stores } from "../drizzle/schema";

describe("multi-tenant data model", () => {
  it("requires an organization id on every tenant-owned resource", () => {
    expect(customers.organizationId).toBeDefined();
    expect(inventory.organizationId).toBeDefined();
    expect(orders.organizationId).toBeDefined();
    expect(products.organizationId).toBeDefined();
    expect(stores.organizationId).toBeDefined();
  });
});
