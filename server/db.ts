import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { ENV } from "./_core/env";
import {
  InsertUser,
  customers,
  inventory,
  orders,
  organizationMembers,
  organizations,
  products,
  productVariants,
  stores,
  users,
} from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;

/** Lazily creates the Drizzle client so local tooling can run without a DB. */
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = {
    openId: user.openId,
    name: user.name ?? null,
    email: user.email ?? null,
    loginMethod: user.loginMethod ?? null,
    lastSignedIn: user.lastSignedIn ?? new Date(),
    role: user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user"),
  };
  await db.insert(users).values(values).onDuplicateKeyUpdate({
    set: { name: values.name, email: values.email, loginMethod: values.loginMethod, lastSignedIn: values.lastSignedIn, role: values.role, updatedAt: new Date() },
  });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getOrganizationIdForUser(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select({ organizationId: organizationMembers.organizationId }).from(organizationMembers).where(eq(organizationMembers.userId, userId)).limit(1);
  return result[0]?.organizationId;
}

export async function getOrganizationForUser(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select({ organization: organizations }).from(organizationMembers).innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id)).where(eq(organizationMembers.userId, userId)).limit(1);
  return result[0]?.organization;
}

export async function listStores(organizationId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(stores).where(eq(stores.organizationId, organizationId)).orderBy(desc(stores.createdAt));
}

export async function listCustomers(organizationId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(customers).where(eq(customers.organizationId, organizationId)).orderBy(desc(customers.createdAt));
}

export async function listProducts(organizationId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(products).where(eq(products.organizationId, organizationId)).orderBy(desc(products.createdAt));
}

export async function listInventory(organizationId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(inventory).where(eq(inventory.organizationId, organizationId)).orderBy(desc(inventory.updatedAt));
}

export async function listVariants(organizationId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ variant: productVariants, product: products }).from(productVariants).innerJoin(products, eq(productVariants.productId, products.id)).where(eq(products.organizationId, organizationId)).orderBy(desc(productVariants.createdAt));
}

export async function listOrders(organizationId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(orders).where(eq(orders.organizationId, organizationId)).orderBy(desc(orders.createdAt)).limit(100);
}

export async function getOperationalSummary(organizationId: number) {
  const db = await getDb();
  if (!db) return { sales: "0", orders: 0, stock: 0, customers: 0, recentOrders: [] };
  const [sales] = await db.select({ total: sql<string>`COALESCE(SUM(${orders.totalAmount}), 0)` }).from(orders).where(and(eq(orders.organizationId, organizationId), sql`${orders.status} <> 'cancelled'`));
  const [orderCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(orders).where(eq(orders.organizationId, organizationId));
  const [stock] = await db.select({ count: sql<number>`COALESCE(SUM(${inventory.quantity}), 0)` }).from(inventory).where(eq(inventory.organizationId, organizationId));
  const [customerCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(customers).where(eq(customers.organizationId, organizationId));
  const recentOrders = await db.select().from(orders).where(eq(orders.organizationId, organizationId)).orderBy(desc(orders.createdAt)).limit(5);
  return { sales: sales?.total ?? "0", orders: Number(orderCount?.count ?? 0), stock: Number(stock?.count ?? 0), customers: Number(customerCount?.count ?? 0), recentOrders };
}
