/**
 * Atelier — fabrication (point 8 de la présentation).
 *
 * Circuit : Coupe → Couture → Broderie → Finition et repassage → Contrôle
 * qualité → Emballage → Livraison à la boutique. Le chef d'atelier assigne
 * les tâches aux ouvriers selon le barème de la marque ; les ouvriers sont
 * payés à la tâche, calculés automatiquement (paie hebdomadaire).
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import { employees, productionOrders, productionTasks, taskRates } from "../../drizzle/schema";
import { requireOrganization } from "../guards";
import { requireDb } from "./shared";

export const STAGES = ["coupe", "couture", "broderie", "finition", "controle_qualite", "emballage", "livraison"] as const;
export type Stage = (typeof STAGES)[number];

export function nextStage(current: Stage): Stage | null {
  const index = STAGES.indexOf(current);
  if (index === -1 || index === STAGES.length - 1) return null;
  return STAGES[index + 1];
}

export const productionRouter = router({
  stages: protectedProcedure.query(() => STAGES),

  list: protectedProcedure.query(async ({ ctx }) => {
    const { organizationId } = await requireOrganization(ctx.user.id);
    const db = await requireDb();
    return db
      .select({ order: productionOrders, tasksCount: sql<number>`(SELECT COUNT(*) FROM "productionTasks" WHERE "productionOrderId" = "productionOrders"."id")`, tasksDone: sql<number>`(SELECT COUNT(*) FROM "productionTasks" WHERE "productionOrderId" = "productionOrders"."id" AND status = 'terminee')` })
      .from(productionOrders)
      .where(eq(productionOrders.organizationId, organizationId))
      .orderBy(desc(productionOrders.createdAt))
      .limit(100);
  }),

  create: protectedProcedure
    .input(
      z.object({
        type: z.enum(["commande", "confection", "retouche"]).default("commande"),
        label: z.string().min(2).max(200),
        customerId: z.number().int().positive().optional(),
        storeId: z.number().int().positive().optional(),
        measurements: z.string().max(1000).optional(),
        notes: z.string().max(1000).optional(),
        dueDate: z.string().max(10).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager", "staff"]);
      const db = await requireDb();
      const [order] = await db
        .insert(productionOrders)
        .values({
          organizationId,
          type: input.type,
          label: input.label,
          customerId: input.customerId ?? null,
          storeId: input.storeId ?? null,
          measurements: input.measurements ?? null,
          notes: input.notes ?? null,
          dueDate: input.dueDate ?? null,
          status: "ouverte",
        })
        .returning();
      return order;
    }),

  /** Avancement d'une fiche vers l'étape suivante du circuit. */
  advance: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager", "staff"]);
      const db = await requireDb();
      const [order] = await db
        .select()
        .from(productionOrders)
        .where(and(eq(productionOrders.id, input.id), eq(productionOrders.organizationId, organizationId)))
        .limit(1);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Fiche de fabrication introuvable." });
      if (order.status === "terminee" || order.status === "annulee") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cette fiche est déjà clôturée." });
      }
      const upcoming = nextStage(order.stage as Stage);
      if (!upcoming) {
        await db.update(productionOrders).set({ status: "terminee", updatedAt: new Date() }).where(eq(productionOrders.id, order.id));
        return { stage: order.stage, done: true } as const;
      }
      await db.update(productionOrders).set({ stage: upcoming, status: "en_cours", updatedAt: new Date() }).where(eq(productionOrders.id, order.id));
      return { stage: upcoming, done: false } as const;
    }),

  cancel: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager"]);
      const db = await requireDb();
      const result = await db
        .update(productionOrders)
        .set({ status: "annulee", updatedAt: new Date() })
        .where(and(eq(productionOrders.id, input.id), eq(productionOrders.organizationId, organizationId)))
        .returning({ id: productionOrders.id });
      return { success: result.length > 0 } as const;
    }),

  /** Barème de paye à la tâche de la marque (modifiable par les responsables). */
  taskRates: protectedProcedure.query(async ({ ctx }) => {
    const { organizationId } = await requireOrganization(ctx.user.id);
    const db = await requireDb();
    return db.select().from(taskRates).where(eq(taskRates.organizationId, organizationId)).orderBy(taskRates.task);
  }),

  upsertTaskRate: protectedProcedure
    .input(z.object({ task: z.string().min(2).max(120), withEmbroidery: z.boolean().default(false), rate: z.string().regex(/^\d+(\.\d{1,2})?$/) }))
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager"]);
      const db = await requireDb();
      await db
        .insert(taskRates)
        .values({ organizationId, task: input.task, withEmbroidery: input.withEmbroidery, rate: input.rate })
        .onConflictDoUpdate({
          target: [taskRates.organizationId, taskRates.task, taskRates.withEmbroidery],
          set: { rate: input.rate, active: true },
        });
      return { success: true } as const;
    }),

  tasks: protectedProcedure.query(async ({ ctx }) => {
    const { organizationId } = await requireOrganization(ctx.user.id);
    const db = await requireDb();
    return db
      .select({
        task: productionTasks,
        orderLabel: productionOrders.label,
        stage: productionOrders.stage,
        employeeName: sql<string>`COALESCE(${employees.firstName} || ' ' || ${employees.lastName}, 'Non assigné')`,
      })
      .from(productionTasks)
      .innerJoin(productionOrders, eq(productionTasks.productionOrderId, productionOrders.id))
      .leftJoin(employees, eq(productionTasks.employeeId, employees.id))
      .where(eq(productionTasks.organizationId, organizationId))
      .orderBy(desc(productionTasks.createdAt))
      .limit(150);
  }),

  /** Assignation d'une tâche à un ouvrier, au tarif du barème. */
  assignTask: protectedProcedure
    .input(
      z.object({
        productionOrderId: z.number().int().positive(),
        employeeId: z.number().int().positive(),
        task: z.string().min(2).max(120),
        withEmbroidery: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager", "staff"]);
      const db = await requireDb();
      const [order] = await db
        .select({ id: productionOrders.id })
        .from(productionOrders)
        .where(and(eq(productionOrders.id, input.productionOrderId), eq(productionOrders.organizationId, organizationId)))
        .limit(1);
      if (!order) throw new TRPCError({ code: "BAD_REQUEST", message: "Fiche introuvable dans votre marque." });
      const [employee] = await db
        .select({ id: employees.id })
        .from(employees)
        .where(and(eq(employees.id, input.employeeId), eq(employees.organizationId, organizationId)))
        .limit(1);
      if (!employee) throw new TRPCError({ code: "BAD_REQUEST", message: "Ouvrier introuvable dans votre marque." });
      const [rateRow] = await db
        .select()
        .from(taskRates)
        .where(and(eq(taskRates.organizationId, organizationId), eq(taskRates.task, input.task), eq(taskRates.withEmbroidery, input.withEmbroidery)))
        .limit(1);
      const [created] = await db
        .insert(productionTasks)
        .values({
          organizationId,
          productionOrderId: input.productionOrderId,
          employeeId: input.employeeId,
          task: input.task,
          withEmbroidery: input.withEmbroidery,
          rate: rateRow?.rate ?? "0",
        })
        .returning();
      // La fiche passe en cours dès qu'un travail est assigné.
      if (order.id) {
        await db.update(productionOrders).set({ status: "en_cours", updatedAt: new Date() }).where(eq(productionOrders.id, order.id));
      }
      return created;
    }),

  completeTask: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager", "staff"]);
      const db = await requireDb();
      const result = await db
        .update(productionTasks)
        .set({ status: "terminee", completedAt: new Date() })
        .where(and(eq(productionTasks.id, input.id), eq(productionTasks.organizationId, organizationId), eq(productionTasks.status, "assignee")))
        .returning({ id: productionTasks.id });
      return { success: result.length > 0 } as const;
    }),

  /**
   * Paie de la semaine en cours (ouvriers à la tâche, point 8/14.3) :
   * somme des tâches terminées depuis le lundi de la semaine.
   */
  weeklyPayroll: protectedProcedure.query(async ({ ctx }) => {
    const { organizationId } = await requireOrganization(ctx.user.id);
    const db = await requireDb();
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    return db
      .select({
        employeeId: productionTasks.employeeId,
        employeeName: sql<string>`COALESCE(${employees.firstName} || ' ' || ${employees.lastName}, '—')`,
        tasksDone: sql<number>`COUNT(*)`,
        totalPay: sql<string>`COALESCE(SUM(${productionTasks.rate}), 0)`,
      })
      .from(productionTasks)
      .leftJoin(employees, eq(productionTasks.employeeId, employees.id))
      .where(
        and(
          eq(productionTasks.organizationId, organizationId),
          eq(productionTasks.status, "terminee"),
          gte(productionTasks.completedAt, monday),
          lte(productionTasks.completedAt, now),
        ),
      )
      .groupBy(productionTasks.employeeId, employees.firstName, employees.lastName)
      .orderBy(desc(sql`SUM(${productionTasks.rate})`));
  }),
});
