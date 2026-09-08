/**
 * Remboursements partiels (point 15), onboarding des marques et réponse
 * support côté admin — dernier tiers de la présentation.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";

process.env.DATABASE_URL = "pglite://:memory:";
process.env.JWT_SECRET = "test-secret";

import { appRouter } from "./routers";
import { getDb, migrateDatabase } from "./db";
import { seed } from "./seed";
import { accountingEntries, accountingLines, organizationMembers, organizations, sales, stores, supportTicketMessages, supportTickets, treasuryMovements, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

/** Accès direct à la base pour les assertions. */
const withDb = async <T>(fn: (db: NonNullable<Awaited<ReturnType<typeof getDb>>>) => T): Promise<T> => fn((await getDb())!);

const owner = appRouter.createCaller({
  user: { id: 2, name: "Propriétaire DISTINCTION", email: "proprietaire@distinction.tg", role: "user" } as TrpcContext["user"],
  req: { protocol: "http", headers: {} } as TrpcContext["req"],
  res: {} as TrpcContext["res"],
});

beforeAll(async () => {
  await migrateDatabase();
  await seed();
});

describe("remboursements partiels en pourcentage (15)", () => {
  it("rembourse 10 % d'une vente : sortie de trésorerie + cumul sur la vente", async () => {
    const db = (await getDb())!;
    const [sale] = await db.select().from(sales).limit(1);
    const total = Number(sale.totalAmount);
    const before = await db.select({ total: sql<string>`COALESCE(SUM(${treasuryMovements.amount}), 0)` }).from(treasuryMovements).where(and(eq(treasuryMovements.accountId, 7), eq(treasuryMovements.direction, "sortie")));
    const result = await owner.sales.refund({ id: sale.id, percent: 10, reason: "Retouche refusée" });
    expect(result.success).toBe(true);
    expect(result.refundedAmount).toBeCloseTo(Math.round(total * 10) / 100, 0);
    expect(result.fullyRefunded).toBe(false);
    const after = await db.select({ total: sql<string>`COALESCE(SUM(${treasuryMovements.amount}), 0)` }).from(treasuryMovements).where(and(eq(treasuryMovements.accountId, 7), eq(treasuryMovements.direction, "sortie")));
    expect(Number(after[0].total) - Number(before[0].total)).toBeGreaterThan(0);
    const [updated] = await db.select().from(sales).where(eq(sales.id, sale.id));
    expect(Number(updated.refundedAmount)).toBeCloseTo(result.refundedAmount, 0);
  });

  it("génère l'écriture de réversion (D 701 / C trésorerie), idempotente", async () => {
    await owner.accounting.sync({});
    const db = (await getDb())!;
    const [refundMovement] = await db.select().from(treasuryMovements).where(eq(treasuryMovements.refType, "refund")).limit(1);
    expect(refundMovement).toBeDefined();
    const [entry] = await db.select().from(accountingEntries).where(and(eq(accountingEntries.refType, "refund"), eq(accountingEntries.refId, refundMovement.id)));
    expect(entry).toBeDefined();
    const lines = await db.select().from(accountingLines).where(eq(accountingLines.entryId, entry.id));
    expect(lines.find((line) => line.accountNumber === "701")?.debit).not.toBe("0.00");
    expect(lines.find((line) => line.accountNumber === "572")?.credit).not.toBe("0.00");
    const before = await db.select({ n: sql<number>`COUNT(*)` }).from(accountingEntries).where(eq(accountingEntries.refType, "refund"));
    await owner.accounting.sync({});
    const after = await db.select({ n: sql<number>`COUNT(*)` }).from(accountingEntries).where(eq(accountingEntries.refType, "refund"));
    expect(Number(after[0].n)).toBe(Number(before[0].n));
  });

  it("refuse de dépasser 100 % et de rembourser deux fois le solde", async () => {
    const db = (await getDb())!;
    const [sale] = await db.select().from(sales).limit(1);
    // 100 % d'un coup : OK, mais le second remboursement est refusé.
    const [fresh] = await db.insert(sales).values({ organizationId: 1, storeId: 2, reference: "VTE-9901", totalAmount: "20000", currency: "XOF", status: "payee" }).returning({ id: sales.id });
    void sale;
    const full = await owner.sales.refund({ id: fresh.id, percent: 100 });
    expect(full.fullyRefunded).toBe(true);
    await expect(owner.sales.refund({ id: fresh.id, percent: 5 })).rejects.toThrow(/remboursée/);
  });

  it("pro rate le dernier remboursement au reste remboursable", async () => {
    const db = (await getDb())!;
    const [fresh] = await db.insert(sales).values({ organizationId: 1, storeId: 2, reference: "VTE-9902", totalAmount: "10000", currency: "XOF", status: "payee" }).returning({ id: sales.id });
    await owner.sales.refund({ id: fresh.id, percent: 60 });
    const last = await owner.sales.refund({ id: fresh.id, percent: 80 }); // demandé 80 % mais il ne reste que 40 %
    expect(last.refundedAmount).toBe(10000);
    expect(last.fullyRefunded).toBe(true);
  });
});

describe("onboarding d'une nouvelle marque (15)", () => {
  it("inscrit un compte, crée la marque (essai 30 j) puis son premier point de vente", async () => {
    // 1. Inscription (publicProcedure : caller sans user).
    const visitor = appRouter.createCaller({
      user: null,
      req: { protocol: "http", headers: {} } as TrpcContext["req"],
      res: { cookie: () => undefined } as unknown as TrpcContext["res"],
    });
    const [existing] = await withDb((db) => db.select({ n: sql<number>`COUNT(*)` }).from(users));
    void existing;
    const user = await visitor.auth.register({ name: "Ada Kouassi", email: "ada@maisonada.ci", password: "maisonada2026" });
    expect(user.email).toBe("ada@maisonada.ci");
    // 2. Connexion authentifiée : création de la marque via le parcours d'accueil.
    const ada = appRouter.createCaller({
      user: { id: user.id, name: user.name, email: user.email, role: user.role } as TrpcContext["user"],
      req: { protocol: "http", headers: {} } as TrpcContext["req"],
      res: { cookie: () => undefined } as unknown as TrpcContext["res"],
    });
    expect(await ada.organization.current()).toBeNull(); // aucun marque → onboarding
    const org = await ada.organization.create({ name: "Maison Ada", slug: "maison-ada", country: "Côte d'Ivoire", sector: "Couture", plan: "complet" });
    expect(org.id).toBeGreaterThan(0);
    const [created] = await withDb((db) => db.select().from(organizations).where(eq(organizations.id, org.id)));
    expect(created.status).toBe("trial");
    expect(created.plan).toBe("complet");
    expect(created.shopUrl).toContain("maison-ada");
    const [membership] = await withDb((db) => db.select().from(organizationMembers).where(eq(organizationMembers.organizationId, org.id)));
    expect(membership.role).toBe("owner");
    // 3. Premier point de vente + second passage refusé.
    const store = await ada.stores.create({ name: "Boutique Cocody", kind: "boutique", city: "Abidjan", currency: "XOF" });
    expect(store.id).toBeGreaterThan(0);
    await expect(ada.organization.create({ name: "Deuxième marque", slug: "deuxieme-marque" })).rejects.toThrow();
  });
});

describe("réponse support côté admin (12)", () => {
  it("l'admin voit tous les tickets, répond (ticket → en cours) puis clôture", async () => {
    // Un client ouvre une demande.
    await owner.support.create({ subject: "Problème de pointage", message: "Le bouton de sortie ne répond pas sur tablette.", pageUrl: "/personnel" });
    const admin = appRouter.createCaller({
      user: { id: 1, name: "Admin ENVOL", email: "admin@envol.africa", role: "admin" } as TrpcContext["user"],
      req: { protocol: "http", headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    });
    const all = await admin.support.listAll();
    const ticket = all.find((row) => row.subject === "Problème de pointage");
    expect(ticket).toBeDefined();
    expect(ticket!.status).toBe("ouvert");
    // Réponse admin : message côté support + passage en cours.
    const reply = await admin.support.respond({ ticketId: ticket!.id, message: "Merci ! Correction déployée, réessayez puis validez." });
    expect(reply.authorSide).toBe("support");
    const [afterReply] = await withDb((db) => db.select().from(supportTickets).where(eq(supportTickets.id, ticket!.id)));
    expect(afterReply.status).toBe("en_cours");
    const messages = await withDb((db) => db.select().from(supportTicketMessages).where(eq(supportTicketMessages.ticketId, ticket!.id)));
    expect(messages.some((message) => message.authorSide === "support")).toBe(true);
    // Clôture.
    await admin.support.close({ ticketId: ticket!.id });
    const [closed] = await withDb((db) => db.select().from(supportTickets).where(eq(supportTickets.id, ticket!.id)));
    expect(closed.status).toBe("ferme");
  });

  it("un simple client ne peut pas répondre aux tickets des autres", async () => {
    const [ticket] = await withDb((db) => db.select().from(supportTickets).limit(1));
    const other = appRouter.createCaller({
      user: { id: 3, name: "Comptable", email: "comptable@distinction.tg", role: "user" } as TrpcContext["user"],
      req: { protocol: "http", headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    });
    await expect(other.support.respond({ ticketId: ticket.id, message: "je m'immisce" })).rejects.toThrow(/permise/);
  });
});
