/**
 * Personnel (points 6 et 14 de la présentation) : employés, présence au
 * poste, paie (hebdomadaire à la tâche pour l'atelier, mensuelle pour la
 * boutique et l'administration) et primes commerciales.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import { attendanceSessions, bonuses, employees, sales, users } from "../../drizzle/schema";
import { requireOrganization } from "../guards";
import { requireDb, loadRates } from "./shared";
import { salesPoints, needsMotivationAlert } from "../domain/commissions";
import { toXof } from "../domain/money";

export const employeesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const { organizationId } = await requireOrganization(ctx.user.id);
    const db = await requireDb();
    return db
      .select({ employee: employees, storeName: sql<string | null>`(SELECT name FROM "stores" WHERE id = ${employees.storeId})` })
      .from(employees)
      .where(eq(employees.organizationId, organizationId))
      .orderBy(employees.type, employees.lastName);
  }),

  create: protectedProcedure
    .input(
      z.object({
        firstName: z.string().min(1).max(80),
        lastName: z.string().min(1).max(80),
        type: z.enum(["boutique", "administration", "atelier"]).default("boutique"),
        jobTitle: z.string().min(2).max(80),
        storeId: z.number().int().positive().optional(),
        baseSalaryMonthly: z.string().regex(/^\d+(\.\d{1,2})?$/).default("0"),
        linkedEmail: z.string().email().max(320).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager"]);
      const db = await requireDb();
      let userId: number | null = null;
      if (input.linkedEmail) {
        const [linked] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.linkedEmail.toLowerCase())).limit(1);
        if (linked) userId = linked.id;
      }
      const [employee] = await db
        .insert(employees)
        .values({
          organizationId,
          userId,
          storeId: input.storeId ?? null,
          firstName: input.firstName,
          lastName: input.lastName,
          type: input.type,
          jobTitle: input.jobTitle,
          baseSalaryMonthly: input.baseSalaryMonthly,
        })
        .returning();
      return employee;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        jobTitle: z.string().min(2).max(80).optional(),
        storeId: z.number().int().positive().nullable().optional(),
        baseSalaryMonthly: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
        active: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager"]);
      const db = await requireDb();
      const result = await db
        .update(employees)
        .set({
          ...(input.jobTitle ? { jobTitle: input.jobTitle } : {}),
          ...(input.storeId !== undefined ? { storeId: input.storeId } : {}),
          ...(input.baseSalaryMonthly ? { baseSalaryMonthly: input.baseSalaryMonthly } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
        })
        .where(and(eq(employees.id, input.id), eq(employees.organizationId, organizationId)))
        .returning({ id: employees.id });
      return { success: result.length > 0 } as const;
    }),

  /** Pointage : arrivée vérifiée sur le lieu de travail (14.2). */
  checkIn: protectedProcedure
    .input(z.object({ employeeId: z.number().int().positive(), storeId: z.number().int().positive().optional(), locationOk: z.boolean().default(true) }))
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager", "staff"]);
      const db = await requireDb();
      const [employee] = await db
        .select()
        .from(employees)
        .where(and(eq(employees.id, input.employeeId), eq(employees.organizationId, organizationId)))
        .limit(1);
      if (!employee) throw new TRPCError({ code: "BAD_REQUEST", message: "Employé introuvable." });
      const open = await db
        .select({ id: attendanceSessions.id })
        .from(attendanceSessions)
        .where(and(eq(attendanceSessions.employeeId, employee.id), sql`${attendanceSessions.checkOutAt} IS NULL`))
        .limit(1);
      if (open.length) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Un pointage est déjà ouvert pour cet employé." });
      const [session] = await db
        .insert(attendanceSessions)
        .values({ organizationId, employeeId: employee.id, storeId: input.storeId ?? employee.storeId, locationOk: input.locationOk })
        .returning();
      return session;
    }),

  checkOut: protectedProcedure
    .input(z.object({ sessionId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager", "staff"]);
      const db = await requireDb();
      const result = await db
        .update(attendanceSessions)
        .set({ checkOutAt: new Date() })
        .where(and(eq(attendanceSessions.id, input.sessionId), eq(attendanceSessions.organizationId, organizationId), sql`${attendanceSessions.checkOutAt} IS NULL`))
        .returning({ id: attendanceSessions.id });
      if (!result.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Pointage introuvable ou déjà clôturé." });
      return { success: true } as const;
    }),

  attendance: protectedProcedure.query(async ({ ctx }) => {
    const { organizationId } = await requireOrganization(ctx.user.id);
    const db = await requireDb();
    return db
      .select({
        session: attendanceSessions,
        employeeName: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`,
      })
      .from(attendanceSessions)
      .innerJoin(employees, eq(attendanceSessions.employeeId, employees.id))
      .where(eq(attendanceSessions.organizationId, organizationId))
      .orderBy(desc(attendanceSessions.checkInAt))
      .limit(80);
  }),

  /** Classement des vendeurs : chiffre d'affaires, points, alertes (14.4). */
  leaderboard: protectedProcedure.query(async ({ ctx }) => {
    const { organizationId } = await requireOrganization(ctx.user.id);
    const db = await requireDb();
    const rates = await loadRates();
    const rows = await db
      .select({
        sellerUserId: sales.sellerUserId,
        sellerName: sql<string>`COALESCE((SELECT name FROM "users" WHERE id = ${sales.sellerUserId}), '—')`,
        totalXof: sql<string>`COALESCE(SUM(${sales.totalAmount}), 0)`,
        salesCount: sql<number>`COUNT(*)`,
      })
      .from(sales)
      .where(and(eq(sales.organizationId, organizationId), sql`${sales.status} <> 'annulee'`))
      .groupBy(sales.sellerUserId)
      .orderBy(desc(sql`SUM(${sales.totalAmount})`))
      .limit(20);
    return rows.map((row) => {
      const totalXof = Number(row.totalXof);
      const points = salesPoints(totalXof);
      return {
        sellerUserId: row.sellerUserId,
        sellerName: row.sellerName,
        totalXof,
        salesCount: Number(row.salesCount),
        points,
        motivationAlert: needsMotivationAlert(points),
      };
    });
  }),

  /** Paie mensuelle : salaires de base du personnel boutique/administration. */
  monthlyPayroll: protectedProcedure.query(async ({ ctx }) => {
    const { organizationId } = await requireOrganization(ctx.user.id);
    const db = await requireDb();
    return db
      .select({
        employee: employees,
        storeName: sql<string | null>`(SELECT name FROM "stores" WHERE id = ${employees.storeId})`,
      })
      .from(employees)
      .where(and(eq(employees.organizationId, organizationId), eq(employees.active, true), sql`${employees.type} <> 'atelier'`))
      .orderBy(employees.type, employees.lastName);
  }),

  awardBonus: protectedProcedure
    .input(
      z.object({
        employeeId: z.number().int().positive(),
        type: z.enum(["meilleur_semaine", "meilleur_mois", "gros_achat", "fidelite", "autre"]),
        amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
        note: z.string().max(300).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager"]);
      const db = await requireDb();
      const [employee] = await db
        .select({ id: employees.id })
        .from(employees)
        .where(and(eq(employees.id, input.employeeId), eq(employees.organizationId, organizationId)))
        .limit(1);
      if (!employee) throw new TRPCError({ code: "BAD_REQUEST", message: "Employé introuvable." });
      const [bonus] = await db
        .insert(bonuses)
        .values({ organizationId, employeeId: employee.id, type: input.type, amount: input.amount, note: input.note ?? null, awardedByUserId: ctx.user.id })
        .returning();
      return bonus;
    }),

  bonuses: protectedProcedure.query(async ({ ctx }) => {
    const { organizationId } = await requireOrganization(ctx.user.id);
    const db = await requireDb();
    return db
      .select({ bonus: bonuses, employeeName: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}` })
      .from(bonuses)
      .innerJoin(employees, eq(bonuses.employeeId, employees.id))
      .where(eq(bonuses.organizationId, organizationId))
      .orderBy(desc(bonuses.createdAt))
      .limit(80);
  }),
});
