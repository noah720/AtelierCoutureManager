import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import { customers, referrals } from "../../drizzle/schema";
import { listCustomers } from "../db";
import { requireOrganization } from "../guards";
import { requireDb } from "./shared";

const customerInput = {
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.string().email().max(320).optional(),
  phone: z.string().max(40).optional(),
  city: z.string().max(100).optional(),
  birthday: z.string().max(10).optional(),
  measurements: z.string().max(2000).optional(),
  notes: z.string().max(4000).optional(),
};

export const customersRouter = router({
  list: protectedProcedure.query(({ ctx }) => requireOrganization(ctx.user.id).then(({ organizationId }) => listCustomers(organizationId))),

  create: protectedProcedure
    .input(z.object(customerInput))
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager"]);
      const db = await requireDb();
      const [customer] = await db
        .insert(customers)
        .values({
          organizationId,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email ?? null,
          phone: input.phone ?? null,
          city: input.city ?? null,
          birthday: input.birthday ?? null,
          measurements: input.measurements ?? null,
          notes: input.notes ?? null,
        })
        .returning();
      return customer;
    }),

  update: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), ...customerInput }))
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager"]);
      const db = await requireDb();
      const result = await db
        .update(customers)
        .set({
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email ?? null,
          phone: input.phone ?? null,
          city: input.city ?? null,
          birthday: input.birthday ?? null,
          measurements: input.measurements ?? null,
          notes: input.notes ?? null,
          updatedAt: new Date(),
        })
        .where(and(eq(customers.id, input.id), eq(customers.organizationId, organizationId)))
        .returning({ id: customers.id });
      return { success: result.length > 0 } as const;
    }),

  /** Création d'un code de parrainage personnel pour un client (point 5.5). */
  createReferral: protectedProcedure
    .input(z.object({ customerId: z.number().int().positive(), code: z.string().min(3).max(32).regex(/^[A-Za-z0-9-]+$/) }))
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager"]);
      const db = await requireDb();
      const [customer] = await db
        .select()
        .from(customers)
        .where(and(eq(customers.id, input.customerId), eq(customers.organizationId, organizationId)))
        .limit(1);
      if (!customer) throw new TRPCError({ code: "BAD_REQUEST", message: "Client introuvable dans votre marque." });
      const code = input.code.toUpperCase();
      const existing = await db
        .select({ id: referrals.id })
        .from(referrals)
        .where(and(eq(referrals.organizationId, organizationId), eq(referrals.code, code)))
        .limit(1);
      if (existing.length) throw new TRPCError({ code: "CONFLICT", message: "Ce code existe déjà." });
      const [referral] = await db
        .insert(referrals)
        .values({ organizationId, code, ownerCustomerId: customer.id, ownerName: `${customer.firstName} ${customer.lastName}` })
        .returning();
      return referral;
    }),

  referrals: protectedProcedure.query(async ({ ctx }) => {
    const { organizationId } = await requireOrganization(ctx.user.id);
    const db = await requireDb();
    return db.select().from(referrals).where(eq(referrals.organizationId, organizationId)).orderBy(referrals.createdAt);
  }),
});
