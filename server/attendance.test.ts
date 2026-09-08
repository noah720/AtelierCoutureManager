/**
 * Pointage géolocalisé & horaires (14.2) + primes planifiées (14.3).
 * Logique pure : minutes hors créneau (+20 %), géorepérage haversine, oubli
 * de pointage (> 15 min), clés de période. E2E : horaires, check-in hors zone,
 * check-out majoré, clôture automatique, plan de primes idempotent.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";

process.env.DATABASE_URL = "pglite://:memory:";
process.env.JWT_SECRET = "test-secret";

import { appRouter } from "./routers";
import { getDb, migrateDatabase } from "./db";
import { seed } from "./seed";
import { attendanceSessions, bonuses, employees } from "../drizzle/schema";
import {
  computeAttendancePay,
  distanceMeters,
  hourlyRateFromMonthly,
  isWithinGeofence,
  minutesOutsideSchedule,
  monthKey,
  parseTimeToMinutes,
  quarterKey,
  scheduleForDay,
  staleSessionClose,
  weekKey,
  type DaySchedule,
} from "./domain/attendance";
import { computePlannedBonuses, PLAN_DEFAULTS, type EmployeeRow, type SellerTotal } from "./domain/bonusPlanner";
import type { TrpcContext } from "./_core/context";

const caller = appRouter.createCaller({
  user: { id: 2, name: "Propriétaire DISTINCTION", email: "proprietaire@distinction.tg", role: "user" } as TrpcContext["user"],
  req: { protocol: "http", headers: {} } as TrpcContext["req"],
  res: {} as TrpcContext["res"],
});

beforeAll(async () => {
  await migrateDatabase();
  await seed();
});

const LOME_STORE = { latitude: "6.1735", longitude: "1.2247", geofenceRadius: 150 };
const jour19h: DaySchedule = { dayOfWeek: 1, startTime: "08:00", endTime: "19:00", active: true };

describe("horaires & majorations — logique pure (14.2)", () => {
  it("parse les heures et identifie le créneau du jour", () => {
    expect(parseTimeToMinutes("08:30")).toBe(510);
    expect(scheduleForDay([jour19h], 1)).toEqual(jour19h);
    expect(scheduleForDay([jour19h], 2)).toBeUndefined();
  });

  it("compte les minutes hors créneau (après la fin, avant l'ouverture, jour non planifié)", () => {
    const checkIn = new Date(2026, 8, 7, 8, 0); // lundi 08:00
    const checkOut = new Date(2026, 8, 7, 20, 0); // 19:00 fin → 60 min hors horaires
    expect(minutesOutsideSchedule(checkIn, checkOut, jour19h)).toBe(60);
    const earlyIn = new Date(2026, 8, 7, 7, 0);
    const out = new Date(2026, 8, 7, 19, 0);
    expect(minutesOutsideSchedule(earlyIn, out, jour19h)).toBe(60); // arrivée 1 h avant
    expect(minutesOutsideSchedule(checkIn, checkOut, undefined)).toBe(720); // sans horaire : tout est hors horaires
  });

  it("majore de 20 % les heures hors horaires", () => {
    const pay = computeAttendancePay({ hourlyRate: 1000, insideMinutes: 120, outsideMinutes: 60 });
    expect(pay.normalPay).toBe(2000);
    expect(pay.overtimePay).toBe(1200); // 1000 × 1 h × 1,2
    expect(pay.total).toBe(3200);
    expect(hourlyRateFromMonthly(104000)).toBe(600.01);
  });

  it("calcule la distance haversine et applique le géorepérage", () => {
    const distance = distanceMeters(6.1735, 1.2247, 6.1742, 1.2250); // ~90 m
    expect(distance).toBeLessThan(150);
    expect(isWithinGeofence(6.1742, 1.2250, LOME_STORE)).toBe(true);
    expect(isWithinGeofence(6.14, 1.21, LOME_STORE)).toBe(false); // ~4 km
    // Sans coordonnées configurées : tout est autorisé.
    expect(isWithinGeofence(6.14, 1.21, { latitude: null, longitude: null, geofenceRadius: 150 })).toBe(true);
  });

  it("détecte un oubli de pointage (> 15 min après la fin) et propose la clôture", () => {
    const openSince = new Date(2026, 8, 7, 8, 0);
    const nowLate = new Date(2026, 8, 7, 19, 20);
    const result = staleSessionClose(openSince, nowLate, jour19h);
    expect(result).not.toBeNull();
    expect(result!.closeAt.getHours()).toBe(19);
    expect(result!.closeAt.getMinutes()).toBe(0);
    expect(result!.reason).toContain("15 min");
    // 19:10 = dans la tolérance → rien à clôturer.
    expect(staleSessionClose(openSince, new Date(2026, 8, 7, 19, 10), jour19h)).toBeNull();
  });

  it("génère les clés de période ISO (semaine, mois, trimestre)", () => {
    expect(weekKey(new Date(2026, 8, 8))).toMatch(/^2026-W3[67]$/);
    expect(monthKey(new Date(2026, 8, 8))).toBe("2026-09");
    expect(quarterKey(new Date(2026, 8, 8))).toBe("2026-T3");
  });
});

describe("primes planifiées — logique pure (14.3)", () => {
  const vendeuse: EmployeeRow = { id: 1, userId: 10, baseSalaryMonthly: "80000", active: true };
  const chef: EmployeeRow = { id: 2, userId: 11, baseSalaryMonthly: "120000", active: true };
  const userToEmployee = new Map([
    [10, vendeuse],
    [11, chef],
  ]);

  it("attribue la prime hebdomadaire et mensuelle au meilleur vendeur uniquement", () => {
    const sellers: SellerTotal[] = [
      { sellerUserId: 10, totalXof: 300000 },
      { sellerUserId: 11, totalXof: 150000 },
    ];
    const plan = computePlannedBonuses({ now: new Date(2026, 8, 8), sellersByWeek: sellers, sellersByMonth: sellers, sellersByQuarter: [], userToEmployee, employees: [vendeuse, chef] });
    const weekly = plan.filter((bonus) => bonus.type === "meilleur_semaine");
    const monthly = plan.filter((bonus) => bonus.type === "meilleur_mois");
    expect(weekly.length).toBe(1);
    expect(weekly[0].employeeId).toBe(1);
    expect(weekly[0].amount).toBe(PLAN_DEFAULTS.weeklyFixed);
    expect(monthly[0].employeeId).toBe(1);
    expect(monthly[0].amount).toBe(PLAN_DEFAULTS.monthlyFixed);
  });

  it("verse la fidélité trimestrielle : 2 % du CA individuel au-delà du seuil", () => {
    const plan = computePlannedBonuses({ now: new Date(2026, 8, 8), sellersByWeek: [], sellersByMonth: [], sellersByQuarter: [{ sellerUserId: 10, totalXof: 1000000 }, { sellerUserId: 11, totalXof: 30000 }], userToEmployee, employees: [vendeuse, chef] });
    const fidelity = plan.filter((bonus) => bonus.type === "fidelite");
    expect(fidelity.length).toBe(1); // 30 000 F < seuil de 50 000
    expect(fidelity[0].employeeId).toBe(1);
    expect(fidelity[0].amount).toBe(20000); // 2 % de 1 000 000
  });

  it("prime annuelle (voiture/moto) = 25 % du salaire pour chaque employé actif", () => {
    const plan = computePlannedBonuses({ now: new Date(2026, 8, 8), sellersByWeek: [], sellersByMonth: [], sellersByQuarter: [], userToEmployee, employees: [vendeuse, chef, { id: 3, userId: null, baseSalaryMonthly: "0", active: true }] });
    const annual = plan.filter((bonus) => bonus.type === "autre");
    expect(annual.length).toBe(2); // salaire nul exclu
    expect(annual.map((bonus) => bonus.amount).sort()).toEqual([20000, 30000]);
    expect(annual[0].note).toContain("voiture/moto");
  });
});

describe("pointage géolocalisé — circuit en base (14.2)", () => {
  it("les horaires du seed couvrent tous les employés (lun-sam actifs)", async () => {
    const schedules = await caller.employees.schedules();
    expect(schedules.length).toBeGreaterThan(5);
    for (const row of schedules) {
      expect(row.days.length).toBe(7);
      expect(row.days.filter((day) => day.active).length).toBe(6); // dimanche repos
    }
  });

  it("pointe l'arrivée hors zone (incident), sort avec majoration, et affiche le résumé", async () => {
    const db = (await getDb())!;
    const [employee] = await db.select().from(employees).limit(1);
    // 1. Arrivée à Cotonou (~240 km de Lomé) → hors zone.
    const session = await caller.employees.checkIn({ employeeId: employee.id, storeId: 2, latitude: 6.37, longitude: 2.39 });
    expect(session.locationOk).toBe(false);
    expect(session.incident).toContain("hors zone");
    // On remonte l'heure d'arrivée de 3 h pour une durée réaliste.
    await db.execute(sql`UPDATE "attendanceSessions" SET "checkInAt" = now() - interval '3 hours' WHERE id = ${session.id}`);
    // 2. Créneau du jour désactivé → toute la durée travaillée est hors horaires.
    await caller.employees.setSchedule({
      employeeId: employee.id,
      days: Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, startTime: "08:00", endTime: "19:00", active: false })),
    });
    const checkOut = await caller.employees.checkOut({ sessionId: session.id, latitude: 6.37, longitude: 2.39 });
    expect(checkOut.outsideMinutes).toBeGreaterThan(0);
    // 3. Résumé du mois : minutes hors horaires et majoration estimée.
    const summary = await caller.employees.attendanceSummary();
    const own = summary.find((row) => row.employee.id === employee.id);
    expect(own!.outsideMinutes).toBe(checkOut.outsideMinutes);
    expect(own!.incidents).toBeGreaterThanOrEqual(1);
  });

  it("clôture automatiquement les pointages oubliés", async () => {
    const db = (await getDb())!;
    const [employee] = await db.select().from(employees).limit(1);
    const session = await caller.employees.checkIn({ employeeId: employee.id });
    // La session a commencé « la veille » : oubli manifeste.
    await db.execute(sql`UPDATE "attendanceSessions" SET "checkInAt" = now() - interval '20 hours' WHERE id = ${session.id}`);
    const result = await caller.employees.autoCloseStale({});
    expect(result.closed.length).toBeGreaterThanOrEqual(1);
    const [closed] = await db.select().from(attendanceSessions).where(eq(attendanceSessions.id, session.id));
    expect(closed.autoClosed).toBe(true);
    expect(closed.checkOutAt).not.toBeNull();
    expect(closed.incident).toContain("clôture automatique");
  });
});

describe("plan de primes — exécution idempotente (14.3)", () => {
  it("crée les primes annuelles du seed, puis rien au second passage", async () => {
    const db = (await getDb())!;
    const first = await caller.employees.runBonusPlan({});
    const annual = first.created.filter((bonus) => bonus.note.includes("voiture/moto"));
    expect(annual.length).toBeGreaterThan(0);
    const inDb = await db.select().from(bonuses).where(sql`${bonuses.periodKey} IS NOT NULL`);
    expect(inDb.length).toBe(first.created.length);

    const second = await caller.employees.runBonusPlan({});
    expect(second.created.length).toBe(0); // idempotent (clé de période unique)
    const after = await db.select().from(bonuses).where(sql`${bonuses.periodKey} IS NOT NULL`);
    expect(after.length).toBe(inDb.length);
  });

  it("la preview liste les primes dues avec les noms des employés", async () => {
    const preview = await caller.employees.bonusPlanPreview();
    expect(preview.bonuses.length).toBeGreaterThan(0);
    expect(preview.bonuses[0].employeeName).not.toContain("n°");
  });
});
