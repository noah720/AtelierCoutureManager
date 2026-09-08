/**
 * Comptabilité SYSCOHADA (10) + rapprochement bancaire (11) — tests sur un
 * PostgreSQL embarqué en mémoire : plan simplifié, écritures de vente
 * équilibrées (encaissements + reste client + produits par famille), écritures
 * d'achat et de règlement, ventes en ligne, mouvements divers, idempotence de
 * la synchronisation, balance équilibrée, résultat, et rapprochement auto.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

process.env.DATABASE_URL = "pglite://:memory:";
process.env.JWT_SECRET = "test-secret";

import { appRouter } from "./routers";
import { getDb, migrateDatabase } from "./db";
import { seed } from "./seed";
import { accountingEntries, accountingLines, bankStatementLines, salePayments, sales, treasuryMovements } from "../drizzle/schema";
import {
  buildMovementLines,
  buildSaleLines,
  finalizeLines,
  isBalanced,
  journalFor,
  purchaseAccount,
  TREASURY_TYPE_ACCOUNT,
} from "./domain/accounting";
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

describe("comptabilité — logique pure (10)", () => {
  it("écrit une vente multi-comptes avec reste client équilibrée", () => {
    const lines = finalizeLines(
      buildSaleLines({
        totalNetOrg: 90000, // 100 000 − 10 % de parrainage
        payments: [
          { accountNumber: "572", amountOrg: 60000 },
          { accountNumber: "531", amountOrg: 24395 },
        ],
        revenueOrg: { vetement: 100000, accessoire: 0 },
      }),
    );
    expect(isBalanced(lines)).toBe(true);
    const client = lines.find((line) => line.accountNumber === "411");
    expect(client?.debit).toBeCloseTo(5605, 0); // reste à payer
    expect(lines.find((line) => line.accountNumber === "701")?.credit).toBeCloseTo(90000, 0);
    const total = lines.reduce((sum, line) => sum + line.debit, 0);
    expect(total).toBeCloseTo(90000, 0); // encaissements 84 395 + reste client 5 605
  });

  it("répartit les produits entre 701 (couture) et 707 (accessoires)", () => {
    const lines = finalizeLines(
      buildSaleLines({
        totalNetOrg: 100000,
        payments: [{ accountNumber: "572", amountOrg: 100000 }],
        revenueOrg: { vetement: 80000, accessoire: 20000 },
      }),
    );
    expect(lines.find((line) => line.accountNumber === "701")?.credit).toBe(80000);
    expect(lines.find((line) => line.accountNumber === "707")?.credit).toBe(20000);
    expect(isBalanced(lines)).toBe(true);
  });

  it("choisit le compte d'achat selon la nature des articles", () => {
    expect(purchaseAccount(["Sac Wax", "Lunettes de soleil"])).toBe("6011");
    expect(purchaseAccount(["Tissu wax 6 yards", "Fils dorés"])).toBe("6021");
    expect(purchaseAccount([])).toBe("6021");
  });

  it("journalise les mouvements divers avec la bonne contrepartie", () => {
    const paie = finalizeLines(buildMovementLines({ treasuryAccountNumber: "521", direction: "sortie", category: "paie", amountOrg: 150000 }));
    expect(paie.find((line) => line.accountNumber === "641")?.debit).toBe(150000);
    expect(paie.find((line) => line.accountNumber === "521")?.credit).toBe(150000);
    const virement = finalizeLines(buildMovementLines({ treasuryAccountNumber: "573", direction: "entree", category: "petite_caisse", amountOrg: 20000 }));
    expect(virement.find((line) => line.accountNumber === "585")?.credit).toBe(20000);
    expect(isBalanced(virement)).toBe(true);
    expect(journalFor("movement", "521")).toBe("BQ");
    expect(journalFor("movement", "572")).toBe("CA");
    expect(TREASURY_TYPE_ACCOUNT.boutique_en_ligne).toBe("533");
  });
});

describe("comptabilité — synchronisation sur la base de démonstration (10)", () => {
  it("génère des écritures équilibrées et l'est deux fois (idempotence)", async () => {
    const db = (await getDb())!;
    const first = await caller.accounting.sync({});
    expect(first.created).toBeGreaterThan(0);

    // Chaque écriture en base est équilibrée.
    const entries = await caller.accounting.entries();
    expect(entries.length).toBe(first.created);
    for (const entry of entries) {
      const debit = entry.lines.reduce((sum, line) => sum + Number(line.debit), 0);
      const credit = entry.lines.reduce((sum, line) => sum + Number(line.credit), 0);
      expect(Math.abs(debit - credit)).toBeLessThan(0.01);
    }

    const second = await caller.accounting.sync({});
    expect(second.created).toBe(0);
    const [count] = await db.select({ n: accountingEntries.id }).from(accountingEntries).limit(1);
    expect(count).toBeDefined();
    const all = await db.select({ id: accountingEntries.id }).from(accountingEntries);
    expect(all.length).toBe(entries.length);
  });

  it("comptabilise une vente partiellement payée avec un reste client (411)", async () => {
    const db = (await getDb())!;
    // Vente 50 000, seulement 30 000 encaissés en espèces.
    const [sale] = await db
      .insert(sales)
      .values({ organizationId: 1, storeId: 2, reference: "VTE-9900", totalAmount: "50000", currency: "XOF", status: "partielle" })
      .returning({ id: sales.id });
    await db.insert(salePayments).values({ saleId: sale.id, method: "cash", currency: "XOF", amount: "30000" });
    await caller.accounting.sync({});
    const [entry] = await db.select().from(accountingEntries).where(and(eq(accountingEntries.refType, "sale"), eq(accountingEntries.refId, sale.id)));
    expect(entry).toBeDefined();
    const lines = await db.select().from(accountingLines).where(eq(accountingLines.entryId, entry.id));
    const rest = lines.find((line) => line.accountNumber === "411");
    expect(rest?.debit).toBe("20000.00");
    expect(lines.find((line) => line.accountNumber === "572")?.debit).toBe("30000.00");
    expect(lines.find((line) => line.accountNumber === "701")?.credit).toBe("50000.00");
    expect(isBalanced(lines.map((line) => ({ debit: Number(line.debit), credit: Number(line.credit) })))).toBe(true);
  });

  it("produit une balance équilibrée et un compte de résultat cohérent", async () => {
    const trial = await caller.accounting.trialBalance();
    expect(trial.totalDebit).toBeGreaterThan(0);
    expect(Math.abs(trial.totalDebit - trial.totalCredit)).toBeLessThan(0.01);
    const income = await caller.accounting.incomeStatement();
    expect(income.produits).toBeGreaterThan(0);
    expect(income.detail.some((row) => row.accountNumber.startsWith("7"))).toBe(true);
    const balance = await caller.accounting.balanceSheet();
    expect(balance.totalTresorerie).toBeGreaterThan(0);
    expect(balance.actif).toBeCloseTo(balance.dettesFournisseurs + Math.max(0, balance.resultat) + balance.reserves, 0);
  });

  it("comptabilise une vente en ligne à partir du mouvement online_payment", async () => {
    const db = (await getDb())!;
    // Mouvement de vente en ligne (15 000 XOF) sur le compte Moneroo (533).
    const [movement] = await db
      .insert(treasuryMovements)
      .values({ organizationId: 1, accountId: 5, direction: "entree", amount: "15000", currency: "XOF", category: "vente", refType: "online_payment", refId: null, label: "Vente en ligne — test" })
      .returning({ id: treasuryMovements.id });
    await caller.accounting.sync({});
    const [entry] = await db.select().from(accountingEntries).where(and(eq(accountingEntries.refType, "online_payment"), eq(accountingEntries.refId, movement.id)));
    expect(entry).toBeDefined();
    expect(entry.journalCode).toBe("BQ");
    const lines = await db.select().from(accountingLines).where(eq(accountingLines.entryId, entry.id));
    expect(lines.find((line) => line.accountNumber === "533")?.debit).toBe("15000.00");
    expect(lines.find((line) => line.accountNumber === "701")?.credit).toBe("15000.00");
  });
});

describe("rapprochement bancaire (11)", () => {
  it("rapproche automatiquement une ligne de relevé au bon montant et à la bonne date", async () => {
    const db = (await getDb())!;
    const bank = await caller.accounting.bankAccount();
    expect(bank).not.toBeNull();
    // Dépôt bancaire saisi dans la trésorerie (le seed ne crée pas de mouvement banque).
    const [movement] = await db
      .insert(treasuryMovements)
      .values({ organizationId: 1, accountId: bank!.id, direction: "entree", amount: "500000", currency: bank!.currency, category: "autre", refType: null, label: "Dépôt espèces en banque" })
      .returning({ id: treasuryMovements.id });
    const target = { id: movement.id, amount: 500000, date: new Date() };
    // Ligne de relevé identique au mouvement, datée du même jour.
    await caller.accounting.addStatementLine({
      accountId: bank!.id,
      statementDate: target.date.toISOString().slice(0, 10),
      label: "Relevé — opération correspondante",
      amount: target!.amount,
      currency: bank!.currency,
    });
    const result = await caller.accounting.autoMatch({});
    expect(result.matched).toBeGreaterThanOrEqual(1);
    const lines = await caller.accounting.statementLines();
    const matched = lines.find((line) => line.label === "Relevé — opération correspondante");
    expect(matched?.matchedMovementId).toBe(target!.id);
    const summary = await caller.accounting.reconciliationSummary();
    expect(summary!.unmatchedMovements.some((movement) => movement.id === target!.id)).toBe(false);
  });

  it("détecte une ligne de relevé sans correspondance comme écart à investiguer", async () => {
    await caller.accounting.addStatementLine({ accountId: (await caller.accounting.bankAccount())!.id, statementDate: "2026-09-01", label: "Frais bancaires inconnus", amount: -2500, currency: "XOF" });
    const summary = await caller.accounting.reconciliationSummary();
    expect(summary!.unmatchedLines.some((line) => line.label === "Frais bancaires inconnus")).toBe(true);
    const result = await caller.accounting.autoMatch({});
    const lines = await caller.accounting.statementLines();
    expect(lines.find((line) => line.label === "Frais bancaires inconnus")?.matchedMovementId).toBeNull();
    void result;
  });

  it("permet de dissocier une ligne rapprochée", async () => {
    const db = (await getDb())!;
    const bank = await caller.accounting.bankAccount();
    const lines = await caller.accounting.statementLines();
    const matched = lines.find((line) => line.matchedMovementId) ?? null;
    if (!matched) {
      // Garantie : une ligne rapprochée existe (créée à l'instant sinon).
      const [movement] = await db
        .insert(treasuryMovements)
        .values({ organizationId: 1, accountId: bank!.id, direction: "sortie", amount: "12000", currency: bank!.currency, category: "autre", refType: null, label: "Retrait frais" })
        .returning({ id: treasuryMovements.id });
      const created = await caller.accounting.addStatementLine({ accountId: bank!.id, statementDate: new Date().toISOString().slice(0, 10), label: "Retrait frais", amount: -12000, currency: bank!.currency });
      await caller.accounting.matchStatementLine({ id: created.id, movementId: movement.id });
    }
    const matchedNow = (await caller.accounting.statementLines()).find((line) => line.matchedMovementId);
    expect(matchedNow).toBeDefined();
    const updated = await caller.accounting.matchStatementLine({ id: matched!.id, movementId: null });
    expect(updated.matchedMovementId).toBeNull();
    await caller.accounting.matchStatementLine({ id: matched!.id, movementId: matched!.matchedMovementId });
    const after = await caller.accounting.statementLines();
    expect(after.find((line) => line.id === matched!.id)?.matchedMovementId).not.toBeNull();
  });
});
