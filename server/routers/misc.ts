/**
 * Commandes clients (point 7.2), assistance (point 12) et vue tableau de bord.
 * Une commande non disponible en boutique part avec sa fiche de fabrication
 * directement côté chef d'atelier.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import { customers, orderItems, orders, productionOrders, productVariants, products, stores, supportTicketMessages, supportTickets } from "../../drizzle/schema";
import { getOperationalSummary, listOrders } from "../db";
import { requireOrganization } from "../guards";
import { requireDb } from "./shared";
import { getOrganizationIdForUser } from "../db";

export const ordersRouter = router({
  list: protectedProcedure.query(({ ctx }) => requireOrganization(ctx.user.id).then(({ organizationId }) => listOrders(organizationId))),

  create: protectedProcedure
    .input(
      z.object({
        storeId: z.number().int().positive(),
        customerId: z.number().int().positive(),
        reference: z.string().min(3).max(32),
        totalAmount: z.string().regex(/^\d+(\.\d{1,2})?$/),
        notes: z.string().max(2000).optional(),
        dueDate: z.string().max(10).optional(),
        items: z
          .array(z.object({ variantId: z.number().int().positive(), quantity: z.number().int().positive(), unitPrice: z.string().regex(/^\d+(\.\d{1,2})?$/) }))
          .max(50)
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager", "staff"]);
      const db = await requireDb();
      const [storeRow] = await db
        .select({ id: stores.id, name: stores.name })
        .from(stores)
        .where(and(eq(stores.id, input.storeId), eq(stores.organizationId, organizationId)))
        .limit(1);
      if (!storeRow) throw new TRPCError({ code: "BAD_REQUEST", message: "La boutique n’appartient pas à votre marque." });
      const [customer] = await db
        .select({ id: customers.id, firstName: customers.firstName, lastName: customers.lastName, measurements: customers.measurements })
        .from(customers)
        .where(and(eq(customers.id, input.customerId), eq(customers.organizationId, organizationId)))
        .limit(1);
      if (!customer) throw new TRPCError({ code: "BAD_REQUEST", message: "Le client n’appartient pas à votre marque." });

      const items = input.items ?? [];
      for (const item of items) {
        const [variant] = await db
          .select({ id: productVariants.id })
          .from(productVariants)
          .innerJoin(products, eq(productVariants.productId, products.id))
          .where(and(eq(productVariants.id, item.variantId), eq(products.organizationId, organizationId)))
          .limit(1);
        if (!variant) throw new TRPCError({ code: "BAD_REQUEST", message: "Une variante n’appartient pas à votre marque." });
      }

      const [order] = await db
        .insert(orders)
        .values({
          organizationId,
          storeId: input.storeId,
          customerId: input.customerId,
          reference: input.reference,
          totalAmount: input.totalAmount,
          notes: input.notes ?? null,
        })
        .returning();
      if (!order?.id) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Création de la commande impossible." });
      if (items.length) {
        await db.insert(orderItems).values(items.map((item) => ({ orderId: order.id, variantId: item.variantId, quantity: item.quantity, unitPrice: item.unitPrice })));
      }
      // Fiche de fabrication automatique pour l'atelier (7.2).
      await db.insert(productionOrders).values({
        organizationId,
        type: "commande",
        orderId: order.id,
        storeId: input.storeId,
        customerId: input.customerId,
        label: `Commande ${input.reference} — ${customer.firstName} ${customer.lastName}`,
        measurements: customer.measurements,
        notes: input.notes ?? null,
        dueDate: input.dueDate ?? null,
      });
      return order;
    }),

  updateStatus: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), status: z.enum(["pending", "confirmed", "in_production", "ready", "delivered", "cancelled"]) }))
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager", "staff"]);
      const db = await requireDb();
      const result = await db
        .update(orders)
        .set({ status: input.status, updatedAt: new Date() })
        .where(and(eq(orders.id, input.id), eq(orders.organizationId, organizationId)))
        .returning({ id: orders.id });
      return { success: result.length > 0 } as const;
    }),
});

export const supportRouter = router({
  /** Ouverte à tout utilisateur connecté (contexte de page pré-rempli). */
  create: protectedProcedure
    .input(z.object({ subject: z.string().min(3).max(200), message: z.string().min(5).max(4000), pageUrl: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const organizationId = await getOrganizationIdForUser(ctx.user.id) ?? null;
      const [ticket] = await db
        .insert(supportTickets)
        .values({
          organizationId,
          userId: ctx.user.id,
          reporterName: ctx.user.name ?? ctx.user.email,
          pageUrl: input.pageUrl ?? null,
          subject: input.subject,
          message: input.message,
        })
        .returning();
      await db.insert(supportTicketMessages).values({ ticketId: ticket.id, authorName: ctx.user.name ?? ctx.user.email, authorSide: "client", message: input.message });
      return ticket;
    }),

  listMine: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return db.select().from(supportTickets).where(eq(supportTickets.userId, ctx.user.id)).orderBy(desc(supportTickets.createdAt)).limit(50);
  }),

  listAll: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    if (ctx.user.role === "admin") {
      return db.select().from(supportTickets).orderBy(desc(supportTickets.createdAt)).limit(200);
    }
    const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager", "staff"]);
    return db.select().from(supportTickets).where(eq(supportTickets.organizationId, organizationId)).orderBy(desc(supportTickets.createdAt)).limit(50);
  }),

  respond: protectedProcedure
    .input(z.object({ ticketId: z.number().int().positive(), message: z.string().min(1).max(4000) }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, input.ticketId)).limit(1);
      if (!ticket) throw new TRPCError({ code: "NOT_FOUND", message: "Demande introuvable." });
      const isAdmin = ctx.user.role === "admin";
      const isOwner = ticket.userId === ctx.user.id;
      if (!isAdmin && !isOwner) throw new TRPCError({ code: "FORBIDDEN", message: "Action non permise." });
      const [message] = await db
        .insert(supportTicketMessages)
        .values({ ticketId: ticket.id, authorName: ctx.user.name ?? ctx.user.email, authorSide: isAdmin ? "support" : "client", message: input.message })
        .returning();
      if (isAdmin && ticket.status === "ouvert") {
        await db.update(supportTickets).set({ status: "en_cours" }).where(eq(supportTickets.id, ticket.id));
      }
      return message;
    }),

  close: protectedProcedure
    .input(z.object({ ticketId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, input.ticketId)).limit(1);
      if (!ticket) throw new TRPCError({ code: "NOT_FOUND", message: "Demande introuvable." });
      const isAdmin = ctx.user.role === "admin";
      if (!isAdmin && ticket.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Action non permise." });
      await db.update(supportTickets).set({ status: isAdmin ? "ferme" : "resolu" }).where(eq(supportTickets.id, ticket.id));
      return { success: true } as const;
    }),
});

export const dashboardRouter = router({
  summary: protectedProcedure.query(({ ctx }) => requireOrganization(ctx.user.id).then(({ organizationId }) => getOperationalSummary(organizationId))),
});
