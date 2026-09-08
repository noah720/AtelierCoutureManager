/**
 * Couche d'accès à la base de données.
 *
 * Deux pilotes PostgreSQL, un seul schéma (pg-core) :
 *  - `pglite://<chemin>` (ou rien) : Postgres embarqué PGlite, pour le
 *    développement local et les tests — aucun serveur requis.
 *  - `postgres://…` / `postgresql://…` : PostgreSQL distant (Neon en
 *    production) via le pilote node-postgres.
 */
import fs from "node:fs";
import path from "node:path";
import { drizzle as drizzlePgLite } from "drizzle-orm/pglite";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";

import { InsertUser, users, customers, inventory, orders, organizationMembers, organizations, products, productVariants, sales, stores } from "../drizzle/schema";

/** Type commun aux deux pilotes : même query-builder PgDatabase. */
export type AppDatabase = PgDatabase<PgQueryResultHKT, Record<string, never>>;

let _pglite: PGlite | null = null;
let _db: AppDatabase | null = null;

function resolvePglitePath(): string {
  const raw = process.env.DATABASE_URL?.startsWith("pglite://")
    ? process.env.DATABASE_URL.slice("pglite://".length)
    : process.env.PGLITE_DATA_DIR || ".data/pglite";
  const resolved = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

async function createDatabase(): Promise<AppDatabase> {
  const url = process.env.DATABASE_URL ?? "";
  if (url && !url.startsWith("pglite://")) {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: url, max: 5, ssl: url.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined });
    return drizzleNodePg(pool) as unknown as AppDatabase;
  }
  _pglite = new PGlite(resolvePglitePath());
  return drizzlePgLite(_pglite) as unknown as AppDatabase;
}

/** Crée (ou réutilise) le client Drizzle. Retourne null si la base est indisponible. */
export async function getDb(): Promise<AppDatabase | null> {
  if (!_db) {
    try {
      _db = await createDatabase();
    } catch (error) {
      console.warn("[Database] Connexion impossible :", error);
      _db = null;
    }
  }
  return _db;
}

/** Applique les migrations Drizzle générées dans ./drizzle (idempotent). */
export async function migrateDatabase(): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Base de données indisponible pour les migrations");
  const folder = path.resolve(process.cwd(), "drizzle");
  if (isPglite(db)) {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(db as unknown as PgliteDatabase<Record<string, never>>, { migrationsFolder: folder });
  } else {
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate(db as unknown as NodePgDatabase<Record<string, never>>, { migrationsFolder: folder });
  }
}

export function isPglite(db: AppDatabase): db is PgliteDatabase<Record<string, never>> {
  return Boolean(_pglite) && Boolean((db as unknown as { $client?: unknown }).$client === _pglite);
}

export async function closeDatabase(): Promise<void> {
  if (_pglite) await _pglite.close();
  _pglite = null;
  _db = null;
}

/* ------------------------------------------------------------------ */
/* Utilisateurs                                                        */
/* ------------------------------------------------------------------ */

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values = {
    openId: user.openId,
    email: user.email,
    passwordHash: user.passwordHash ?? null,
    name: user.name ?? null,
    loginMethod: user.loginMethod ?? "local",
    role: user.role ?? "user",
    lastSignedIn: user.lastSignedIn ?? new Date(),
  };
  await db
    .insert(users)
    .values(values)
    .onConflictDoUpdate({
      target: users.openId,
      set: { name: values.name, email: values.email, lastSignedIn: values.lastSignedIn, updatedAt: new Date() },
    });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

/* ------------------------------------------------------------------ */
/* Organisations                                                       */
/* ------------------------------------------------------------------ */

export async function getOrganizationIdForUser(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, userId))
    .limit(1);
  return result[0]?.organizationId;
}

export async function getOrganizationForUser(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select({ organization: organizations })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
    .where(eq(organizationMembers.userId, userId))
    .limit(1);
  return result[0]?.organization;
}

/* ------------------------------------------------------------------ */
/* Listes métier                                                       */
/* ------------------------------------------------------------------ */

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
  return db
    .select({ variant: productVariants, product: products })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(eq(products.organizationId, organizationId))
    .orderBy(desc(productVariants.createdAt));
}

export async function listOrders(organizationId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(orders).where(eq(orders.organizationId, organizationId)).orderBy(desc(orders.createdAt)).limit(100);
}

export async function listSales(organizationId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(sales).where(eq(sales.organizationId, organizationId)).orderBy(desc(sales.createdAt)).limit(100);
}

/* ------------------------------------------------------------------ */
/* Tableau de bord                                                     */
/* ------------------------------------------------------------------ */

export async function getOperationalSummary(organizationId: number) {
  const db = await getDb();
  if (!db) return { salesToday: "0", salesMonth: "0", orders: 0, stock: 0, customers: 0, recentSales: [], recentOrders: [] };
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [today] = await db
    .select({ total: sql<string>`COALESCE(SUM(${sales.totalAmount}), 0)` })
    .from(sales)
    .where(and(eq(sales.organizationId, organizationId), gte(sales.createdAt, startOfDay)));
  const [month] = await db
    .select({ total: sql<string>`COALESCE(SUM(${sales.totalAmount}), 0)` })
    .from(sales)
    .where(and(eq(sales.organizationId, organizationId), gte(sales.createdAt, startOfMonth)));
  const [orderCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(orders).where(eq(orders.organizationId, organizationId));
  const [stock] = await db.select({ count: sql<number>`COALESCE(SUM(${inventory.quantity}), 0)` }).from(inventory).where(eq(inventory.organizationId, organizationId));
  const [customerCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(customers).where(eq(customers.organizationId, organizationId));
  const recentSales = await db.select().from(sales).where(eq(sales.organizationId, organizationId)).orderBy(desc(sales.createdAt)).limit(6);
  const recentOrders = await db.select().from(orders).where(eq(orders.organizationId, organizationId)).orderBy(desc(orders.createdAt)).limit(5);

  return {
    salesToday: today?.total ?? "0",
    salesMonth: month?.total ?? "0",
    orders: Number(orderCount?.count ?? 0),
    stock: Number(stock?.count ?? 0),
    customers: Number(customerCount?.count ?? 0),
    recentSales,
    recentOrders,
  };
}
