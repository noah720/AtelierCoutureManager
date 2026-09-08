import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { router, publicProcedure, protectedProcedure, adminProcedure } from "../_core/trpc";
import { organizations, organizationMembers, subscriptionPayments } from "../../drizzle/schema";
import { getDb, getOrganizationForUser, getOrganizationIdForUser } from "../db";
import { requireDb } from "./shared";
import { effectiveOrgStatus, planPrice, trialEndsFrom, PLANS, type PlanKey } from "../domain/subscription";

export const organizationRouter = router({
  current: protectedProcedure.query(async ({ ctx }) => {
    const organization = await getOrganizationForUser(ctx.user.id);
    if (!organization) return null;
    return { ...organization, effectiveStatus: effectiveOrgStatus({ status: organization.status, trialEndsAt: organization.trialEndsAt, subscriptionEndsAt: organization.subscriptionEndsAt }) };
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(2).max(160),
        slug: z.string().min(2).max(96).regex(/^[a-z0-9-]+$/, "Slug invalide (minuscules, chiffres, tirets)"),
        country: z.string().max(80).optional(),
        sector: z.string().max(120).optional(),
        plan: z.enum(["boutique", "atelier_boutique", "complet"]).default("boutique"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const existing = await getOrganizationIdForUser(ctx.user.id);
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "Ce compte possède déjà une marque." });
      const [organization] = await db
        .insert(organizations)
        .values({
          name: input.name,
          slug: input.slug,
          country: input.country ?? null,
          sector: input.sector ?? null,
          plan: input.plan,
          status: "trial",
          trialEndsAt: trialEndsFrom(new Date()),
          shopUrl: `https://${input.slug}.ateliermanager.africa`,
        })
        .returning({ id: organizations.id });
      if (!organization?.id) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Création de la marque impossible." });
      await db.insert(organizationMembers).values({ organizationId: organization.id, userId: ctx.user.id, role: "owner" });
      return { id: organization.id };
    }),

  updateSettings: protectedProcedure
    .input(
      z.object({
        name: z.string().min(2).max(160).optional(),
        country: z.string().max(80).optional(),
        sector: z.string().max(120).optional(),
        referralCustomerRate: z.number().min(0).max(100).optional(),
        referralAffiliateRate: z.number().min(0).max(100).optional(),
        customDomain: z.string().max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const membership = await db
        .select({ organizationId: organizationMembers.organizationId, role: organizationMembers.role })
        .from(organizationMembers)
        .where(eq(organizationMembers.userId, ctx.user.id))
        .limit(1);
      const current = membership[0];
      if (!current) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Aucune marque associée à ce compte." });
      if (current.role !== "owner" && current.role !== "manager") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Seuls les responsables peuvent modifier les réglages." });
      }
      await db
        .update(organizations)
        .set({
          ...(input.name ? { name: input.name } : {}),
          ...(input.country !== undefined ? { country: input.country } : {}),
          ...(input.sector !== undefined ? { sector: input.sector } : {}),
          ...(input.referralCustomerRate !== undefined ? { referralCustomerRate: String(input.referralCustomerRate) } : {}),
          ...(input.referralAffiliateRate !== undefined ? { referralAffiliateRate: String(input.referralAffiliateRate) } : {}),
          ...(input.customDomain !== undefined ? { customDomain: input.customDomain, domainVerified: false } : {}),
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, current.organizationId));
      return { success: true } as const;
    }),

  /** Demande d'abonnement : crée un paiement en attente de validation par ENVOL. */
  requestSubscription: protectedProcedure
    .input(z.object({ plan: z.enum(["boutique", "atelier_boutique", "complet"]), months: z.union([z.literal(1), z.literal(12)]), method: z.string().max(40).default("mobile_money"), reference: z.string().max(120).optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const organizationId = await getOrganizationIdForUser(ctx.user.id);
      if (!organizationId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Aucune marque associée à ce compte." });
      const amount = planPrice(input.plan as PlanKey, input.months);
      const [payment] = await db
        .insert(subscriptionPayments)
        .values({
          organizationId,
          plan: input.plan,
          months: input.months,
          amount: String(amount),
          method: input.method,
          reference: input.reference ?? null,
          status: "en_attente",
        })
        .returning({ id: subscriptionPayments.id });
      return { id: payment.id, amount };
    }),

  subscriptionPayments: protectedProcedure.query(async ({ ctx }) => {
    const organizationId = await getOrganizationIdForUser(ctx.user.id);
    if (!organizationId) return [];
    const db = await getDb();
    if (!db) return [];
    return db.select().from(subscriptionPayments).where(eq(subscriptionPayments.organizationId, organizationId)).orderBy(subscriptionPayments.createdAt);
  }),

  plans: publicProcedure.query(() =>
    Object.entries(PLANS).map(([key, value]) => ({
      key,
      label: value.label,
      monthly: value.monthly,
      annual: planPrice(key as PlanKey, 12),
      annualDiscountPercent: value.annualDiscountPercent,
    })),
  ),
});

/** Réservé à l'équipe ENVOL : gestion globale des abonnements. */
export const subscriptionAdminRouter = router({
  pendingPayments: adminProcedure.query(async () => {
    const db = await requireDb();
    const rows = await db
      .select({ payment: subscriptionPayments, organization: organizations })
      .from(subscriptionPayments)
      .innerJoin(organizations, eq(subscriptionPayments.organizationId, organizations.id))
      .where(eq(subscriptionPayments.status, "en_attente"))
      .orderBy(subscriptionPayments.createdAt);
    return rows;
  }),

  validatePayment: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const [payment] = await db.select().from(subscriptionPayments).where(eq(subscriptionPayments.id, input.id)).limit(1);
    if (!payment || payment.status !== "en_attente") throw new TRPCError({ code: "BAD_REQUEST", message: "Paiement introuvable ou déjà traité." });
    const [org] = await db.select().from(organizations).where(eq(organizations.id, payment.organizationId)).limit(1);
    if (!org) throw new TRPCError({ code: "BAD_REQUEST", message: "Marque introuvable." });
    const now = new Date();
    const base = org.subscriptionEndsAt && org.subscriptionEndsAt > now ? org.subscriptionEndsAt : now;
    const ends = new Date(base);
    ends.setMonth(ends.getMonth() + payment.months);
    await db.update(subscriptionPayments).set({ status: "valide", validatedByUserId: ctx.user.id }).where(eq(subscriptionPayments.id, payment.id));
    await db.update(organizations).set({ status: "active", plan: payment.plan, subscriptionEndsAt: ends, updatedAt: now }).where(eq(organizations.id, org.id));
    return { success: true, subscriptionEndsAt: ends } as const;
  }),

  refusePayment: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await db.update(subscriptionPayments).set({ status: "refuse", validatedByUserId: ctx.user.id }).where(and(eq(subscriptionPayments.id, input.id), eq(subscriptionPayments.status, "en_attente")));
    return { success: true } as const;
  }),
});
