import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import { inventory, inventoryMovements, productVariants, products } from "../../drizzle/schema";
import { listInventory, listProducts, listVariants } from "../db";
import { requireOrganization } from "../guards";
import { requireDb } from "./shared";

export const productsRouter = router({
  list: protectedProcedure.query(({ ctx }) => requireOrganization(ctx.user.id).then(({ organizationId }) => listProducts(organizationId))),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(2).max(160),
        family: z.enum(["vetement", "accessoire"]).default("vetement"),
        category: z.string().min(2).max(80),
        genre: z.enum(["femme", "homme", "enfant"]).default("homme"),
        gamme: z.enum(["leader", "vip", "royale", "presidentiel"]).default("leader"),
        sizes: z.string().max(200).optional(),
        basePrice: z.string().regex(/^\d+(\.\d{1,2})?$/),
        description: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager"]);
      const db = await requireDb();
      const [product] = await db
        .insert(products)
        .values({
          organizationId,
          name: input.name,
          family: input.family,
          category: input.category,
          genre: input.genre,
          gamme: input.gamme,
          sizes: input.sizes ?? null,
          basePrice: input.basePrice,
          description: input.description ?? null,
        })
        .returning();
      return product;
    }),
});

export const variantsRouter = router({
  list: protectedProcedure.query(({ ctx }) => requireOrganization(ctx.user.id).then(({ organizationId }) => listVariants(organizationId))),

  create: protectedProcedure
    .input(
      z.object({
        productId: z.number().int().positive(),
        sku: z.string().min(2).max(64),
        size: z.string().max(32).optional(),
        color: z.string().max(64).optional(),
        price: z.string().regex(/^\d+(\.\d{1,2})?$/),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager"]);
      const db = await requireDb();
      const [product] = await db
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.id, input.productId), eq(products.organizationId, organizationId)))
        .limit(1);
      if (!product) throw new TRPCError({ code: "BAD_REQUEST", message: "Le produit n’appartient pas à votre marque." });
      const [variant] = await db
        .insert(productVariants)
        .values({ productId: input.productId, sku: input.sku, size: input.size ?? null, color: input.color ?? null, price: input.price })
        .returning();
      return variant;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        sku: z.string().min(2).max(64),
        size: z.string().max(32).optional(),
        color: z.string().max(64).optional(),
        price: z.string().regex(/^\d+(\.\d{1,2})?$/),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager"]);
      const db = await requireDb();
      const [variant] = await db
        .select({ id: productVariants.id })
        .from(productVariants)
        .innerJoin(products, eq(productVariants.productId, products.id))
        .where(and(eq(productVariants.id, input.id), eq(products.organizationId, organizationId)))
        .limit(1);
      if (!variant) return { success: false } as const;
      const result = await db
        .update(productVariants)
        .set({ sku: input.sku, size: input.size ?? null, color: input.color ?? null, price: input.price })
        .where(eq(productVariants.id, input.id))
        .returning({ id: productVariants.id });
      return { success: result.length > 0 } as const;
    }),
});

export const inventoryRouter = router({
  list: protectedProcedure.query(({ ctx }) => requireOrganization(ctx.user.id).then(({ organizationId }) => listInventory(organizationId))),

  adjust: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), quantity: z.number().int().min(0), note: z.string().max(300).optional() }))
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager"]);
      const db = await requireDb();
      const [row] = await db
        .select()
        .from(inventory)
        .where(and(eq(inventory.id, input.id), eq(inventory.organizationId, organizationId)))
        .limit(1);
      if (!row) return { success: false } as const;
      const delta = input.quantity - row.quantity;
      await db.update(inventory).set({ quantity: input.quantity, updatedAt: new Date() }).where(eq(inventory.id, row.id));
      if (delta !== 0) {
        await db.insert(inventoryMovements).values({
          organizationId,
          storeId: row.storeId,
          variantId: row.variantId,
          delta,
          reason: "ajustement",
          note: input.note ?? null,
          createdByUserId: ctx.user.id,
        });
      }
      return { success: true } as const;
    }),

  /** Stock agrégé d'une variante sur toutes les boutiques (vue boutique en ligne). */
  availability: protectedProcedure
    .input(z.object({ variantId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id);
      const db = await requireDb();
      const [row] = await db
        .select({ total: sql<number>`COALESCE(SUM(${inventory.quantity}), 0)` })
        .from(inventory)
        .where(and(eq(inventory.organizationId, organizationId), eq(inventory.variantId, input.variantId)));
      return { total: Number(row?.total ?? 0) };
    }),
});

