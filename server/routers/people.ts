/**
 * Personnel (points 6 et 14 de la présentation) : employés, présence au
 * poste, paie (hebdomadaire à la tâche pour l'atelier, mensuelle pour la
 * boutique et l'administration) et primes commerciales.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import { attendanceSessions, bonuses, employees, employeeSchedules, sales, stores, users } from "../../drizzle/schema";
import { requireOrganization } from "../guards";
import { requireDb, loadRates } from "./shared";
import { salesPoints, needsMotivationAlert } from "../domain/commissions";
import { computeAttendancePay, hourlyRateFromMonthly, isWithinGeofence, minutesOutsideSchedule, monthBounds, quarterBounds, scheduleForDay, staleSessionClose, weekBounds, yearBounds } from "../domain/attendance";
import { computePlannedBonuses, PLAN_DEFAULTS, PLANNED_RULES } from "../domain/bonusPlanner";
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

  /** Pointage : arrivée vérifiée par géolocalisation (14.2). */
  checkIn: protectedProcedure
    .input(z.object({ employeeId: z.number().int().positive(), storeId: z.number().int().positive().optional(), latitude: z.number().min(-90).max(90).optional(), longitude: z.number().min(-180).max(180).optional() }))
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
      const storeId = input.storeId ?? employee.storeId;
      // Géorepérage : distance au point de vente (si coordonnées fournies et configurées).
      let locationOk = true;
      let incident: string | null = null;
      if (storeId && input.latitude !== undefined && input.longitude !== undefined) {
        const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
        if (store) {
          locationOk = isWithinGeofence(input.latitude, input.longitude, store);
          if (!locationOk) incident = "Pointage hors zone — hors du rayon du point de vente";
        }
      }
      // Retard par rapport au créneau du jour (> 5 min).
      const schedules = await db.select().from(employeeSchedules).where(eq(employeeSchedules.employeeId, employee.id));
      const today = scheduleForDay(schedules, new Date().getDay());
      if (today && today.active) {
        const [h, m] = today.startTime.split(":").map(Number);
        const now = new Date();
        const lateMinutes = now.getHours() * 60 + now.getMinutes() - (h * 60 + m);
        if (lateMinutes > 5) incident = incident ? `${incident} — retard de ${lateMinutes} min` : `Retard de ${lateMinutes} min`;
      }
      const [session] = await db
        .insert(attendanceSessions)
        .values({
          organizationId,
          employeeId: employee.id,
          storeId,
          locationOk,
          incident,
          checkInLat: input.latitude !== undefined ? String(input.latitude) : null,
          checkInLng: input.longitude !== undefined ? String(input.longitude) : null,
        })
        .returning();
      return session;
    }),

  checkOut: protectedProcedure
    .input(z.object({ sessionId: z.number().int().positive(), latitude: z.number().min(-90).max(90).optional(), longitude: z.number().min(-180).max(180).optional() }))
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager", "staff"]);
      const db = await requireDb();
      const [session] = await db
        .select()
        .from(attendanceSessions)
        .where(and(eq(attendanceSessions.id, input.sessionId), eq(attendanceSessions.organizationId, organizationId), sql`${attendanceSessions.checkOutAt} IS NULL`))
        .limit(1);
      if (!session) throw new TRPCError({ code: "BAD_REQUEST", message: "Pointage introuvable ou déjà clôturé." });
      const now = new Date();
      // Minutes hors créneau (majoration +20 %) d'après l'horaire du jour.
      const schedules = await db.select().from(employeeSchedules).where(eq(employeeSchedules.employeeId, session.employeeId));
      const outside = minutesOutsideSchedule(session.checkInAt, now, scheduleForDay(schedules, session.checkInAt.getDay()));
      const result = await db
        .update(attendanceSessions)
        .set({
          checkOutAt: now,
          outsideMinutes: outside,
          checkOutLat: input.latitude !== undefined ? String(input.latitude) : null,
          checkOutLng: input.longitude !== undefined ? String(input.longitude) : null,
        })
        .where(eq(attendanceSessions.id, session.id))
        .returning({ id: attendanceSessions.id });
      return { success: true, outsideMinutes: outside } as const;
    }),

  /**
   * Détecte et clôture automatiquement les pointages oubliés : session
   * encore ouverte plus de 15 minutes après la fin du créneau (14.2).
   */
  autoCloseStale: protectedProcedure
    .input(z.object({}).default({}))
    .mutation(async ({ ctx }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager", "staff"]);
      const db = await requireDb();
      const open = await db
        .select({ session: attendanceSessions, firstName: employees.firstName, lastName: employees.lastName })
        .from(attendanceSessions)
        .innerJoin(employees, eq(attendanceSessions.employeeId, employees.id))
        .where(and(eq(attendanceSessions.organizationId, organizationId), sql`${attendanceSessions.checkOutAt} IS NULL`));
      const closed: Array<{ employee: string; reason: string }> = [];
      const now = new Date();
      for (const row of open) {
        const schedules = await db.select().from(employeeSchedules).where(eq(employeeSchedules.employeeId, row.session.employeeId));
        const stale = staleSessionClose(row.session.checkInAt, now, scheduleForDay(schedules, row.session.checkInAt.getDay()));
        if (!stale) continue;
        const outside = minutesOutsideSchedule(row.session.checkInAt, stale.closeAt, scheduleForDay(schedules, row.session.checkInAt.getDay()));
        await db
          .update(attendanceSessions)
          .set({ checkOutAt: stale.closeAt, autoClosed: true, outsideMinutes: outside, incident: [row.session.incident, stale.reason].filter(Boolean).join(" — ") })
          .where(eq(attendanceSessions.id, row.session.id));
        closed.push({ employee: `${row.firstName} ${row.lastName}`, reason: stale.reason });
      }
      return { closed } as const;
    }),

  /** Créneaux horaires hebdomadaires de tous les employés. */
  schedules: protectedProcedure.query(async ({ ctx }) => {
    const { organizationId } = await requireOrganization(ctx.user.id);
    const db = await requireDb();
    const staff = await db.select().from(employees).where(eq(employees.organizationId, organizationId)).orderBy(employees.lastName);
    const schedules = await db.select().from(employeeSchedules).where(eq(employeeSchedules.organizationId, organizationId));
    return staff.map((employee) => ({
      employee,
      days: Array.from({ length: 7 }, (_, dayOfWeek) => {
        const found = schedules.find((schedule) => schedule.employeeId === employee.id && schedule.dayOfWeek === dayOfWeek);
        return { dayOfWeek, startTime: found?.startTime ?? "08:00", endTime: found?.endTime ?? "19:00", active: found?.active ?? (dayOfWeek >= 1 && dayOfWeek <= 6) };
      }),
    }));
  }),

  /** Enregistre les 7 créneaux d'un employé (remplace). */
  setSchedule: protectedProcedure
    .input(z.object({
      employeeId: z.number().int().positive(),
      days: z.array(z.object({ dayOfWeek: z.number().int().min(0).max(6), startTime: z.string().regex(/^\d{2}:\d{2}$/), endTime: z.string().regex(/^\d{2}:\d{2}$/), active: z.boolean() })).length(7),
    }))
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager"]);
      const db = await requireDb();
      const [employee] = await db.select({ id: employees.id }).from(employees).where(and(eq(employees.id, input.employeeId), eq(employees.organizationId, organizationId))).limit(1);
      if (!employee) throw new TRPCError({ code: "BAD_REQUEST", message: "Employé introuvable." });
      for (const day of input.days) {
        await db
          .insert(employeeSchedules)
          .values({ organizationId, employeeId: employee.id, dayOfWeek: day.dayOfWeek, startTime: day.startTime, endTime: day.endTime, active: day.active })
          .onConflictDoUpdate({ target: [employeeSchedules.employeeId, employeeSchedules.dayOfWeek], set: { startTime: day.startTime, endTime: day.endTime, active: day.active } });
      }
      return { success: true } as const;
    }),

  /** Configure le géorepérage d'un point de vente. */
  setStoreGeofence: protectedProcedure
    .input(z.object({ storeId: z.number().int().positive(), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), geofenceRadius: z.number().int().min(20).max(5000).default(150) }))
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager"]);
      const db = await requireDb();
      const result = await db
        .update(stores)
        .set({ latitude: String(input.latitude), longitude: String(input.longitude), geofenceRadius: input.geofenceRadius })
        .where(and(eq(stores.id, input.storeId), eq(stores.organizationId, organizationId)))
        .returning({ id: stores.id });
      if (!result.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Point de vente introuvable." });
      return { success: true } as const;
    }),

  /** Résumé mensuel du pointage : heures hors horaires et majoration estimée. */
  attendanceSummary: protectedProcedure.query(async ({ ctx }) => {
    const { organizationId } = await requireOrganization(ctx.user.id);
    const db = await requireDb();
    const bounds = monthBounds(new Date());
    const sessions = await db
      .select()
      .from(attendanceSessions)
      .where(and(eq(attendanceSessions.organizationId, organizationId), gte(attendanceSessions.checkInAt, bounds.start)));
    const staff = await db.select().from(employees).where(eq(employees.organizationId, organizationId));
    return staff.map((employee) => {
      const own = sessions.filter((session) => session.employeeId === employee.id);
      const workedMinutes = own.reduce((sum, session) => {
        const end = session.checkOutAt ?? new Date();
        return sum + Math.max(0, Math.round((end.getTime() - session.checkInAt.getTime()) / 60000));
      }, 0);
      const outsideMinutes = own.reduce((sum, session) => sum + (session.outsideMinutes ?? 0), 0);
      const pay = computeAttendancePay({
        hourlyRate: hourlyRateFromMonthly(Number(employee.baseSalaryMonthly) || 0),
        insideMinutes: Math.max(0, workedMinutes - outsideMinutes),
        outsideMinutes,
      });
      return {
        employee,
        sessions: own.length,
        workedMinutes,
        outsideMinutes,
        overtimeAllowance: pay.overtimePay,
        incidents: own.filter((session) => session.incident).length,
      };
    });
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

  /** Règles de primes planifiées affichées à l'utilisateur. */
  bonusPlanRules: protectedProcedure.query(async () => ({ rules: PLANNED_RULES, defaults: PLAN_DEFAULTS })),

  /** Aperçu des primes que créerait l'exécution du plan maintenant. */
  bonusPlanPreview: protectedProcedure.query(async ({ ctx }) => {
    const { organizationId } = await requireOrganization(ctx.user.id);
    return computePlan(organizationId);
  }),

  /** Exécute le plan de primes (idempotent par période). */
  runBonusPlan: protectedProcedure
    .input(z.object({}).default({}))
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager"]);
      const { bonuses: planned } = await computePlan(organizationId);
      const db = await requireDb();
      const created: Array<{ employee: string; note: string; amount: number }> = [];
      for (const bonus of planned) {
        const inserted = await db
          .insert(bonuses)
          .values({ organizationId, employeeId: bonus.employeeId, type: bonus.type, amount: bonus.amount.toFixed(2), note: bonus.note, periodKey: bonus.periodKey, awardedByUserId: ctx.user.id })
          .onConflictDoNothing()
          .returning({ id: bonuses.id });
        if (inserted.length) {
          const [employee] = await db.select({ firstName: employees.firstName, lastName: employees.lastName }).from(employees).where(eq(employees.id, bonus.employeeId)).limit(1);
          created.push({ employee: employee ? `${employee.firstName} ${employee.lastName}` : `#${bonus.employeeId}`, note: bonus.note, amount: bonus.amount });
        }
      }
      return { created } as const;
    }),
});

/** Calcule les primes dues (ventes XOF par vendeur pour chaque période). */
async function computePlan(organizationId: number) {
  const db = await requireDb();
  const now = new Date();
  const rates = await loadRates();
  const sellerTotals = async (bounds: { start: Date; end: Date }) => {
    const rows = await db
      .select({ sellerUserId: sales.sellerUserId, currency: sales.currency, totalAmount: sales.totalAmount })
      .from(sales)
      .where(and(eq(sales.organizationId, organizationId), gte(sales.createdAt, bounds.start), sql`${sales.createdAt} < ${bounds.end}`, sql`${sales.status} <> 'annulee'`));
    const totals = new Map<number | null, number>();
    for (const row of rows) {
      const xof = toXof(Number(row.totalAmount), row.currency, rates);
      totals.set(row.sellerUserId, (totals.get(row.sellerUserId) ?? 0) + xof);
    }
    return [...totals.entries()].map(([sellerUserId, totalXof]) => ({ sellerUserId, totalXof }));
  };
  const sellersByWeek = await sellerTotals(weekBounds(now));
  const sellersByMonth = await sellerTotals(monthBounds(now));
  const sellersByQuarter = await sellerTotals(quarterBounds(now));
  const staff = await db.select().from(employees).where(eq(employees.organizationId, organizationId));
  const userToEmployee = new Map(staff.filter((employee) => employee.userId !== null).map((employee) => [employee.userId as number, employee]));
  const bonuses = computePlannedBonuses({ now, sellersByWeek, sellersByMonth, sellersByQuarter, userToEmployee, employees: staff, plan: PLAN_DEFAULTS });
  const nameOf = (employeeId: number) => {
    const employee = staff.find((row) => row.id === employeeId);
    return employee ? `${employee.firstName} ${employee.lastName}` : `Employé n°${employeeId}`;
  };
  return { bonuses: bonuses.map((bonus) => ({ ...bonus, employeeName: nameOf(bonus.employeeId) })) };
}
