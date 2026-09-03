import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb, getOperationalSummary, getOrganizationForUser, getOrganizationIdForUser, listCustomers, listInventory, listOrders, listProducts, listStores, listVariants } from "./db";
import { customers, inventory, orders, organizationMembers, organizations, products, stores } from "../drizzle/schema";

export function assertAllowedRole(role: "owner" | "manager" | "staff", allowedRoles: Array<"owner" | "manager" | "staff">) {
  if (!allowedRoles.includes(role)) throw new TRPCError({ code: "FORBIDDEN", message: "Votre rôle ne permet pas cette action." });
}

async function requireOrganization(userId: number, allowedRoles: Array<"owner" | "manager" | "staff"> = ["owner", "manager", "staff"]) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Base de données indisponible." });
  const membership = await db.select({ organizationId: organizationMembers.organizationId, role: organizationMembers.role }).from(organizationMembers).where(eq(organizationMembers.userId, userId)).limit(1);
  const current = membership[0];
  if (!current) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Aucune marque n’est encore associée à ce compte." });
  assertAllowedRole(current.role, allowedRoles);
  return current.organizationId;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  organization: router({
    current: protectedProcedure.query(({ ctx }) => getOrganizationForUser(ctx.user.id)),
    create: protectedProcedure.input(z.object({ name: z.string().min(2).max(160), slug: z.string().min(2).max(96).regex(/^[a-z0-9-]+$/), country: z.string().max(80).optional() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Base de données indisponible." });
      const existing = await getOrganizationIdForUser(ctx.user.id);
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "Ce compte possède déjà une marque." });
      const [organization] = await db.insert(organizations).values({ name: input.name, slug: input.slug, country: input.country ?? null }).$returningId();
      if (!organization?.id) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Création de la marque impossible." });
      await db.insert(organizationMembers).values({ organizationId: organization.id, userId: ctx.user.id, role: "owner" });
      return { id: organization.id };
    }),
  }),

  dashboard: router({
    summary: protectedProcedure.query(({ ctx }) => requireOrganization(ctx.user.id).then(getOperationalSummary)),
  }),

  stores: router({
    list: protectedProcedure.query(({ ctx }) => requireOrganization(ctx.user.id).then(listStores)),
    create: protectedProcedure.input(z.object({ name: z.string().min(2).max(160), city: z.string().max(100).optional(), address: z.string().max(240).optional() })).mutation(async ({ ctx, input }) => {
      const organizationId = await requireOrganization(ctx.user.id, ["owner", "manager"]);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
      const [store] = await db.insert(stores).values({ organizationId, name: input.name, city: input.city ?? null, address: input.address ?? null }).$returningId();
      return store;
    }),
    deactivate: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const organizationId = await requireOrganization(ctx.user.id, ["owner", "manager"]);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Base de données indisponible." });
      const result = await db.update(stores).set({ isActive: false }).where(and(eq(stores.id, input.id), eq(stores.organizationId, organizationId)));
      return { success: Boolean((result as { affectedRows?: number }).affectedRows) } as const;
    }),
  }),

  customers: router({
    list: protectedProcedure.query(({ ctx }) => requireOrganization(ctx.user.id).then(listCustomers)),
    create: protectedProcedure.input(z.object({ firstName: z.string().min(1).max(80), lastName: z.string().min(1).max(80), email: z.string().email().optional(), phone: z.string().max(40).optional(), city: z.string().max(100).optional(), measurements: z.string().max(2000).optional() })).mutation(async ({ ctx, input }) => {
      const organizationId = await requireOrganization(ctx.user.id, ["owner", "manager"]);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
      const [customer] = await db.insert(customers).values({ organizationId, firstName: input.firstName, lastName: input.lastName, email: input.email ?? null, phone: input.phone ?? null, city: input.city ?? null, measurements: input.measurements ?? null }).$returningId();
      return customer;
    }),
  }),

  inventory: router({
    list: protectedProcedure.query(({ ctx }) => requireOrganization(ctx.user.id).then(listInventory)),
    adjust: protectedProcedure.input(z.object({ id: z.number().int().positive(), quantity: z.number().int().min(0) })).mutation(async ({ ctx, input }) => {
      const organizationId = await requireOrganization(ctx.user.id, ["owner", "manager"]);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Base de données indisponible." });
      const result = await db.update(inventory).set({ quantity: input.quantity }).where(and(eq(inventory.id, input.id), eq(inventory.organizationId, organizationId)));
      return { success: Boolean((result as { affectedRows?: number }).affectedRows) } as const;
    }),
  }),

  variants: router({
    list: protectedProcedure.query(({ ctx }) => requireOrganization(ctx.user.id).then(listVariants)),
  }),

  orders: router({
    list: protectedProcedure.query(({ ctx }) => requireOrganization(ctx.user.id).then(listOrders)),
    create: protectedProcedure.input(z.object({ storeId: z.number().int().positive(), customerId: z.number().int().positive(), reference: z.string().min(3).max(32), totalAmount: z.string().regex(/^\\d+(\\.\\d{1,2})?$/), notes: z.string().max(2000).optional() })).mutation(async ({ ctx, input }) => {
      const organizationId = await requireOrganization(ctx.user.id, ["owner", "manager", "staff"]);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Base de données indisponible." });
      const [store] = await db.select({ id: stores.id }).from(stores).where(and(eq(stores.id, input.storeId), eq(stores.organizationId, organizationId))).limit(1);
      const [customer] = await db.select({ id: customers.id }).from(customers).where(and(eq(customers.id, input.customerId), eq(customers.organizationId, organizationId))).limit(1);
      if (!store || !customer) throw new TRPCError({ code: "BAD_REQUEST", message: "La boutique ou le client n’appartient pas à votre marque." });
      const [order] = await db.insert(orders).values({ organizationId, storeId: input.storeId, customerId: input.customerId, reference: input.reference, totalAmount: input.totalAmount, notes: input.notes ?? null }).$returningId();
      return order;
    }),
  }),

  products: router({
    list: protectedProcedure.query(({ ctx }) => requireOrganization(ctx.user.id).then(listProducts)),
    create: protectedProcedure.input(z.object({ name: z.string().min(2).max(160), category: z.string().min(2).max(80), basePrice: z.string().regex(/^\d+(\.\d{1,2})?$/), description: z.string().max(2000).optional() })).mutation(async ({ ctx, input }) => {
      const organizationId = await requireOrganization(ctx.user.id, ["owner", "manager"]);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
      const [product] = await db.insert(products).values({ organizationId, name: input.name, category: input.category, basePrice: input.basePrice, description: input.description ?? null }).$returningId();
      return product;
    }),
  }),

  admin: router({
    health: adminProcedure.query(() => ({ ok: true })),
  }),
});

export type AppRouter = typeof appRouter;
