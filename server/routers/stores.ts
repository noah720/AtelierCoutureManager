import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import { organizationMembers, stores, treasuryAccounts } from "../../drizzle/schema";
import { listStores } from "../db";
import { requireOrganization } from "../guards";
import { requireDb } from "./shared";

export const storesRouter = router({
  list: protectedProcedure.query(({ ctx }) => requireOrganization(ctx.user.id).then(({ organizationId }) => listStores(organizationId))),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(2).max(160),
        kind: z.enum(["boutique", "atelier"]).default("boutique"),
        city: z.string().max(100).optional(),
        address: z.string().max(240).optional(),
        currency: z.enum(["XOF", "XAF", "USD", "EUR"]).default("XOF"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager"]);
      const db = await requireDb();
      const [store] = await db
        .insert(stores)
        .values({
          organizationId,
          name: input.name,
          kind: input.kind,
          city: input.city ?? null,
          address: input.address ?? null,
          currency: input.currency,
        })
        .returning();
      // Création automatique de la caisse de la boutique en trésorerie.
      await db
        .insert(treasuryAccounts)
        .values({
          organizationId,
          type: input.kind === "atelier" ? "petite_caisse" : "caisse_boutique",
          storeId: store.id,
          label: input.kind === "atelier" ? `Petite caisse — ${input.name}` : `Caisse — ${input.name}`,
          currency: input.currency,
        })
        .onConflictDoNothing();
      return store;
    }),

  update: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), name: z.string().min(2).max(160), city: z.string().max(100).optional(), address: z.string().max(240).optional() }))
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager"]);
      const db = await requireDb();
      const result = await db
        .update(stores)
        .set({ name: input.name, city: input.city ?? null, address: input.address ?? null })
        .where(and(eq(stores.id, input.id), eq(stores.organizationId, organizationId)))
        .returning({ id: stores.id });
      return { success: result.length > 0 } as const;
    }),

  deactivate: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager"]);
      const db = await requireDb();
      const result = await db
        .update(stores)
        .set({ isActive: false })
        .where(and(eq(stores.id, input.id), eq(stores.organizationId, organizationId)))
        .returning({ id: stores.id });
      return { success: result.length > 0 } as const;
    }),
});

