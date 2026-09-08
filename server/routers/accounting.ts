/**
 * Comptabilité SYSCOHADA (10) et rapprochement bancaire (11).
 *
 * `sync` est idempotent : chaque opération (vente, achat, paiement, mouvement)
 * produit exactement une écriture, grâce à l'index unique (marque, type, réf).
 * Les montants sont exprimés dans la devise de la marque, avec conversion des
 * règlements multidevises via les taux de change.
 */
import { z } from "zod";
import { and, asc, desc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { requireDb } from "./shared";
import { requireOrganization } from "../guards";
import { loadRates } from "./shared";
import { convert, type CurrencyCode, type RateMap } from "../domain/money";
import {
  accountingEntries,
  accountingLines,
  bankStatementLines,
  orderItems,
  productVariants,
  products,
  purchaseRequestItems,
  purchaseRequests,
  saleItems,
  salePayments,
  sales,
  treasuryAccounts,
  treasuryMovements,
} from "../../drizzle/schema";
import {
  buildMovementLines,
  buildSaleLines,
  CHART,
  finalizeLines,
  isBalanced,
  journalFor,
  METHOD_TREASURY_TYPE,
  purchaseAccount,
  TREASURY_TYPE_ACCOUNT,
} from "../domain/accounting";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Insère une écriture équilibrée (ou rien si elle existe déjà — index unique). */
async function insertEntry(db: Db, params: { organizationId: number; journalCode: string; reference: string; refType: string; refId: number | null; label: string; date: Date; raw: Array<{ accountNumber: string; debit?: number; credit?: number }> }) {
  const lines = finalizeLines(params.raw);
  if (!lines.length) return null;
  if (!isBalanced(lines)) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Écriture déséquilibrée : ${params.label}` });
  const inserted = await db
    .insert(accountingEntries)
    .values({ organizationId: params.organizationId, journalCode: params.journalCode, reference: params.reference, refType: params.refType, refId: params.refId, label: params.label, entryDate: params.date })
    .onConflictDoNothing()
    .returning({ id: accountingEntries.id });
  const entryId = inserted[0]?.id;
  if (!entryId) return null;
  await db.insert(accountingLines).values(lines.map((line) => ({ entryId, organizationId: params.organizationId, accountNumber: line.accountNumber, accountLabel: line.accountLabel, debit: line.debit.toFixed(2), credit: line.credit.toFixed(2) })));
  return entryId;
}

/**
 * Génère toutes les écritures manquantes de la marque. Peut être appelé
 * plusieurs fois sans créer de doublons. Renvoie le détail du travail.
 */
export async function syncAccounting(organizationId: number): Promise<{ created: number; details: Record<string, number> }> {
  const db = (await getDb())!;
  const rates: RateMap = await loadRates();
  const [currencyRow] = await db.select({ currency: treasuryAccounts.currency }).from(treasuryAccounts).where(eq(treasuryAccounts.organizationId, organizationId)).limit(1);
  const currency = (currencyRow?.currency ?? "XOF") as CurrencyCode;
  const toOrg = (amount: number, from: string) => round2(convert(amount, (from || "XOF") as CurrencyCode, currency, rates));

  const treasuryRows = await db.select().from(treasuryAccounts).where(eq(treasuryAccounts.organizationId, organizationId));
  const accountNumberById = new Map<number, string>();
  for (const account of treasuryRows) accountNumberById.set(account.id, TREASURY_TYPE_ACCOUNT[account.type] ?? "585");

  const details: Record<string, number> = { ventes: 0, achats: 0, reglements_achats: 0, ventes_en_ligne: 0, mouvements: 0 };
  let created = 0;

  /* ---- 1. Ventes : encaissements par compte + reste client + produits ---- */
  const orgSales = await db
    .select()
    .from(sales)
    .where(and(eq(sales.organizationId, organizationId), notInArray(sales.status, ["annulee"])))
    .orderBy(asc(sales.createdAt));
  const journalizedSales = new Set(
    (await db.select({ refId: accountingEntries.refId }).from(accountingEntries).where(and(eq(accountingEntries.organizationId, organizationId), eq(accountingEntries.refType, "sale")))).map((row) => row.refId),
  );
  for (const sale of orgSales) {
    if (journalizedSales.has(sale.id)) continue;
    const payments = await db.select().from(salePayments).where(eq(salePayments.saleId, sale.id));
    const items = await db
      .select({ variantId: saleItems.variantId, quantity: saleItems.quantity, unitPrice: saleItems.unitPrice })
      .from(saleItems)
      .where(eq(saleItems.saleId, sale.id));
    const familyOfVariant = new Map<number, string>();
    if (items.length) {
      const variantRows = await db
        .select({ id: productVariants.id, family: products.family })
        .from(productVariants)
        .innerJoin(products, eq(productVariants.productId, products.id))
        .where(inArray(productVariants.id, items.map((item) => item.variantId)));
      for (const row of variantRows) familyOfVariant.set(row.id, row.family);
    }
    const revenue = { vetement: 0, accessoire: 0 };
    for (const item of items) {
      revenue[(familyOfVariant.get(item.variantId) ?? "vetement") === "accessoire" ? "accessoire" : "vetement"] += Number(item.unitPrice) * item.quantity;
    }
    const totalGross = round2(revenue.vetement + revenue.accessoire) || 1;
    const scale = Number(sale.totalAmount) / totalGross; // remise/parrainage répartie proportionnellement
    const totalNetOrg = toOrg(Number(sale.totalAmount), sale.currency);
    const paymentsForEntry: Array<{ accountNumber: string; amountOrg: number }> = [];
    for (const payment of payments) {
      const type = METHOD_TREASURY_TYPE[payment.method] ?? "banque";
      let accountNumber: string;
      if (type === "caisse_boutique") {
        const storeAccount = treasuryRows.find((row) => row.type === "caisse_boutique" && row.storeId === sale.storeId) ?? treasuryRows.find((row) => row.type === "caisse_centrale");
        accountNumber = accountNumberById.get(storeAccount?.id ?? -1) ?? "571";
      } else {
        accountNumber = TREASURY_TYPE_ACCOUNT[type] ?? "521";
      }
      paymentsForEntry.push({ accountNumber, amountOrg: toOrg(Number(payment.amount), payment.currency) });
    }
    const entry = await insertEntry(db, {
      organizationId,
      journalCode: "VT",
      reference: sale.reference,
      refType: "sale",
      refId: sale.id,
      label: `Vente ${sale.reference}`,
      date: sale.createdAt,
      raw: buildSaleLines({
        totalNetOrg,
        payments: paymentsForEntry,
        revenueOrg: { vetement: revenue.vetement * scale, accessoire: revenue.accessoire * scale },
      }),
    });
    if (entry) {
      created += 1;
      details.ventes += 1;
    }
  }

  /* ---- 2. Achats approuvés : D 60x / C 401, puis règlement : D 401 / C 5x ---- */
  const purchases = await db
    .select()
    .from(purchaseRequests)
    .where(and(eq(purchaseRequests.organizationId, organizationId), inArray(purchaseRequests.status, ["approubee", "commandee", "recue"])));
  const journalizedPurchases = new Set(
    (await db.select({ refId: accountingEntries.refId }).from(accountingEntries).where(and(eq(accountingEntries.organizationId, organizationId), eq(accountingEntries.refType, "purchase")))).map((row) => row.refId),
  );
  for (const purchase of purchases) {
    if (journalizedPurchases.has(purchase.id)) continue;
    const items = await db.select({ label: purchaseRequestItems.label }).from(purchaseRequestItems).where(eq(purchaseRequestItems.requestId, purchase.id));
    const amountOrg = toOrg(Number(purchase.totalAmount), purchase.currency);
    const entry = await insertEntry(db, {
      organizationId,
      journalCode: "AC",
      reference: `ACH-${String(purchase.id).padStart(4, "0")}`,
      refType: "purchase",
      refId: purchase.id,
      label: `Achat — ${purchase.supplier ?? purchase.requesterName}`.slice(0, 240),
      date: purchase.decidedAt ?? purchase.createdAt,
      raw: [
        { accountNumber: purchaseAccount(items.map((item) => item.label)), debit: amountOrg },
        { accountNumber: "401", credit: amountOrg },
      ],
    });
    if (entry) {
      created += 1;
      details.achats += 1;
    }
  }
  const purchasePayments = await db
    .select()
    .from(treasuryMovements)
    .where(and(eq(treasuryMovements.organizationId, organizationId), eq(treasuryMovements.refType, "purchase")));
  const journalizedPurchasePayments = new Set(
    (await db.select({ refId: accountingEntries.refId }).from(accountingEntries).where(and(eq(accountingEntries.organizationId, organizationId), eq(accountingEntries.refType, "purchase_payment")))).map((row) => row.refId),
  );
  for (const movement of purchasePayments) {
    if (journalizedPurchasePayments.has(movement.id)) continue;
    const accountNumber = accountNumberById.get(movement.accountId);
    if (!accountNumber) continue;
    const amountOrg = toOrg(Number(movement.amount), movement.currency);
    const entry = await insertEntry(db, {
      organizationId,
      journalCode: "AC",
      reference: `RGP-${String(movement.id).padStart(4, "0")}`,
      refType: "purchase_payment",
      refId: movement.id,
      label: movement.label.slice(0, 240),
      date: movement.createdAt,
      raw: [
        { accountNumber: "401", debit: amountOrg },
        { accountNumber, credit: amountOrg },
      ],
    });
    if (entry) {
      created += 1;
      details.reglements_achats += 1;
    }
  }

  /* ---- 3. Ventes en ligne (mouvements online_payment) : D 533 / C 70x ---- */
  const onlineMovements = await db
    .select()
    .from(treasuryMovements)
    .where(and(eq(treasuryMovements.organizationId, organizationId), eq(treasuryMovements.refType, "online_payment")));
  const journalizedOnline = new Set(
    (await db.select({ refId: accountingEntries.refId }).from(accountingEntries).where(and(eq(accountingEntries.organizationId, organizationId), eq(accountingEntries.refType, "online_payment")))).map((row) => row.refId),
  );
  for (const movement of onlineMovements) {
    if (journalizedOnline.has(movement.id)) continue;
    const accountNumber = accountNumberById.get(movement.accountId) ?? "533";
    const amountOrg = toOrg(Number(movement.amount), movement.currency);
    let raw: Array<{ accountNumber: string; debit?: number; credit?: number }>;
    if (movement.refId) {
      const items = await db
        .select({ quantity: orderItems.quantity, unitPrice: orderItems.unitPrice, family: products.family })
        .from(orderItems)
        .innerJoin(productVariants, eq(orderItems.variantId, productVariants.id))
        .innerJoin(products, eq(productVariants.productId, products.id))
        .where(eq(orderItems.orderId, movement.refId));
      const revenue = { vetement: 0, accessoire: 0 };
      for (const item of items) revenue[item.family === "accessoire" ? "accessoire" : "vetement"] += Number(item.unitPrice) * item.quantity;
      const totalGross = round2(revenue.vetement + revenue.accessoire);
      raw =
        totalGross > 0.005
          ? buildSaleLines({
              totalNetOrg: amountOrg,
              payments: [{ accountNumber, amountOrg }],
              revenueOrg: { vetement: (revenue.vetement / totalGross) * amountOrg, accessoire: (revenue.accessoire / totalGross) * amountOrg },
            })
          : [
              { accountNumber, debit: amountOrg },
              { accountNumber: "701", credit: amountOrg },
            ];
    } else {
      raw = [
        { accountNumber, debit: amountOrg },
        { accountNumber: "701", credit: amountOrg },
      ];
    }
    const entry = await insertEntry(db, {
      organizationId,
      journalCode: "BQ",
      reference: `WEB-${String(movement.refId ?? movement.id).padStart(4, "0")}`,
      refType: "online_payment",
      refId: movement.id,
      label: movement.label.slice(0, 240),
      date: movement.createdAt,
      raw,
    });
    if (entry) {
      created += 1;
      details.ventes_en_ligne += 1;
    }
  }

  /* ---- 4. Mouvements divers (paie, abonnement, virements, ajustements) ---- */
  const otherMovements = await db
    .select()
    .from(treasuryMovements)
    .where(and(eq(treasuryMovements.organizationId, organizationId), isNull(treasuryMovements.refType)));
  const journalizedMovements = new Set(
    (await db.select({ refId: accountingEntries.refId }).from(accountingEntries).where(and(eq(accountingEntries.organizationId, organizationId), eq(accountingEntries.refType, "movement")))).map((row) => row.refId),
  );
  for (const movement of otherMovements) {
    if (journalizedMovements.has(movement.id)) continue;
    const accountNumber = accountNumberById.get(movement.accountId);
    if (!accountNumber) continue;
    const amountOrg = toOrg(Number(movement.amount), movement.currency);
    const entry = await insertEntry(db, {
      organizationId,
      journalCode: journalFor("movement", accountNumber),
      reference: `MV-${String(movement.id).padStart(4, "0")}`,
      refType: "movement",
      refId: movement.id,
      label: movement.label.slice(0, 240),
      date: movement.createdAt,
      raw: buildMovementLines({ treasuryAccountNumber: accountNumber, direction: movement.direction, category: movement.category, amountOrg }),
    });
    if (entry) {
      created += 1;
      details.mouvements += 1;
    }
  }

  return { created, details };
}

export const accountingRouter = router({
  /** Plan comptable simplifié affiché à l'utilisateur. */
  chart: protectedProcedure.query(async ({ ctx }) => {
    await requireOrganization(ctx.user.id, ["owner", "manager", "staff"]);
    return Object.entries(CHART).map(([number, entry]) => ({ number, label: entry.label, class: entry.class }));
  }),

  /** Génère les écritures manquantes (idempotent). */
  sync: protectedProcedure
    .input(z.object({}).default({}))
    .mutation(async ({ ctx }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager", "staff"]);
      return syncAccounting(organizationId);
    }),

  /** Journal des écritures avec leurs lignes (les plus récentes d'abord). */
  entries: protectedProcedure.query(async ({ ctx }) => {
    const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager", "staff"]);
    const db = await requireDb();
    const entries = await db.select().from(accountingEntries).where(eq(accountingEntries.organizationId, organizationId)).orderBy(desc(accountingEntries.entryDate), desc(accountingEntries.id)).limit(80);
    if (!entries.length) return [];
    const lines = await db
      .select()
      .from(accountingLines)
      .where(and(eq(accountingLines.organizationId, organizationId), inArray(accountingLines.entryId, entries.map((entry) => entry.id))));
    return entries.map((entry) => ({ ...entry, lines: lines.filter((line) => line.entryId === entry.id) }));
  }),

  /** Balance générale : par compte, débit, crédit, solde — totaux équilibrés. */
  trialBalance: protectedProcedure.query(async ({ ctx }) => {
    const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager", "staff"]);
    const db = await requireDb();
    const rows = await db
      .select({
        accountNumber: accountingLines.accountNumber,
        accountLabel: accountingLines.accountLabel,
        debit: sql<string>`SUM(${accountingLines.debit})`,
        credit: sql<string>`SUM(${accountingLines.credit})`,
      })
      .from(accountingLines)
      .where(eq(accountingLines.organizationId, organizationId))
      .groupBy(accountingLines.accountNumber, accountingLines.accountLabel)
      .orderBy(asc(accountingLines.accountNumber));
    const accounts = rows.map((row) => ({
      accountNumber: row.accountNumber,
      accountLabel: row.accountLabel,
      debit: round2(Number(row.debit ?? 0)),
      credit: round2(Number(row.credit ?? 0)),
      balance: round2(Number(row.debit ?? 0) - Number(row.credit ?? 0)),
    }));
    return {
      accounts,
      totalDebit: round2(accounts.reduce((sum, account) => sum + account.debit, 0)),
      totalCredit: round2(accounts.reduce((sum, account) => sum + account.credit, 0)),
    };
  }),

  /** Compte de résultat : produits (classe 7) vs charges (classe 6) → résultat. */
  incomeStatement: protectedProcedure.query(async ({ ctx }) => {
    const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager", "staff"]);
    const db = await requireDb();
    const rows = await db
      .select({ accountNumber: accountingLines.accountNumber, debit: sql<string>`SUM(${accountingLines.debit})`, credit: sql<string>`SUM(${accountingLines.credit})` })
      .from(accountingLines)
      .where(eq(accountingLines.organizationId, organizationId))
      .groupBy(accountingLines.accountNumber);
    let charges = 0;
    let produits = 0;
    const detail: Array<{ accountNumber: string; label: string; amount: number }> = [];
    for (const row of rows) {
      const entry = CHART[row.accountNumber];
      if (!entry) continue;
      const balance = round2(Number(row.debit ?? 0) - Number(row.credit ?? 0));
      if (entry.class === 6 && balance !== 0) {
        charges += balance;
        detail.push({ accountNumber: row.accountNumber, label: entry.label, amount: balance });
      }
      if (entry.class === 7 && balance !== 0) {
        produits += -balance;
        detail.push({ accountNumber: row.accountNumber, label: entry.label, amount: -balance });
      }
    }
    return { charges: round2(charges), produits: round2(produits), resultat: round2(produits - charges), detail };
  }),

  /** Bilan simplifié : trésorerie + créances ; dettes fournisseurs, résultat, réserves. */
  balanceSheet: protectedProcedure.query(async ({ ctx }) => {
    const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager", "staff"]);
    const db = await requireDb();
    const treasuryRows = await db.select().from(treasuryAccounts).where(eq(treasuryAccounts.organizationId, organizationId));
    const movementSums = await db
      .select({ accountId: treasuryMovements.accountId, net: sql<string>`SUM(CASE WHEN ${treasuryMovements.direction} = 'entree' THEN ${treasuryMovements.amount} ELSE -${treasuryMovements.amount} END)` })
      .from(treasuryMovements)
      .where(eq(treasuryMovements.organizationId, organizationId))
      .groupBy(treasuryMovements.accountId);
    const netByAccount = new Map(movementSums.map((row) => [row.accountId, Number(row.net ?? 0)]));
    const tresorerie = treasuryRows.map((account) => ({
      label: account.label,
      type: account.type,
      currency: account.currency,
      balance: round2(Number(account.openingBalance) + (netByAccount.get(account.id) ?? 0)),
    }));
    const rows = await db
      .select({ accountNumber: accountingLines.accountNumber, debit: sql<string>`SUM(${accountingLines.debit})`, credit: sql<string>`SUM(${accountingLines.credit})` })
      .from(accountingLines)
      .where(eq(accountingLines.organizationId, organizationId))
      .groupBy(accountingLines.accountNumber);
    let creancesClients = 0;
    let dettesFournisseurs = 0;
    let charges = 0;
    let produits = 0;
    for (const row of rows) {
      const balance = round2(Number(row.debit ?? 0) - Number(row.credit ?? 0));
      if (row.accountNumber === "411") creancesClients = balance;
      if (row.accountNumber === "401") dettesFournisseurs = -balance;
      const entry = CHART[row.accountNumber];
      if (entry?.class === 6) charges += balance;
      if (entry?.class === 7) produits += -balance;
    }
    const resultat = round2(produits - charges) || 0;
    const totalTresorerie = round2(tresorerie.reduce((sum, account) => sum + account.balance, 0)) || 0;
    const creances = round2(creancesClients) || 0;
    const dettes = round2(dettesFournisseurs) || 0;
    const actif = round2(totalTresorerie + creances);
    const passifConnu = round2(dettes + Math.max(0, resultat));
    return {
      tresorerie,
      totalTresorerie,
      creancesClients: creances,
      dettesFournisseurs: dettes,
      resultat,
      /** Réserves : capital initial et Reports non ventilés dans ce plan simplifié. */
      reserves: round2(actif - passifConnu),
      actif,
    };
  }),

  /* ---- Rapprochement bancaire (11) ---- */

  /** Compte bancaire de la marque (support du rapprochement). */
  bankAccount: protectedProcedure.query(async ({ ctx }) => {
    const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager", "staff"]);
    const db = await requireDb();
    const [account] = await db.select().from(treasuryAccounts).where(and(eq(treasuryAccounts.organizationId, organizationId), eq(treasuryAccounts.type, "banque"))).limit(1);
    return account ?? null;
  }),

  /** Lignes de relevé importées. */
  statementLines: protectedProcedure.query(async ({ ctx }) => {
    const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager", "staff"]);
    const db = await requireDb();
    return db.select().from(bankStatementLines).where(eq(bankStatementLines.organizationId, organizationId)).orderBy(desc(bankStatementLines.statementDate)).limit(100);
  }),

  addStatementLine: protectedProcedure
    .input(z.object({ accountId: z.number().int().positive(), statementDate: z.string().min(8), label: z.string().min(1).max(240), amount: z.number(), currency: z.enum(["XOF", "XAF", "USD", "EUR"]).default("XOF") }))
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager", "staff"]);
      const db = await requireDb();
      const [line] = await db
        .insert(bankStatementLines)
        .values({ organizationId, accountId: input.accountId, statementDate: new Date(input.statementDate), label: input.label, amount: input.amount.toFixed(2), currency: input.currency })
        .returning();
      return line;
    }),

  removeStatementLine: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager", "staff"]);
      const db = await requireDb();
      await db.delete(bankStatementLines).where(and(eq(bankStatementLines.id, input.id), eq(bankStatementLines.organizationId, organizationId)));
      return { success: true } as const;
    }),

  /** Associe (ou dissocie) une ligne de relevé à un mouvement de trésorerie. */
  matchStatementLine: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), movementId: z.number().int().positive().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager", "staff"]);
      const db = await requireDb();
      const [line] = await db.update(bankStatementLines).set({ matchedMovementId: input.movementId }).where(and(eq(bankStatementLines.id, input.id), eq(bankStatementLines.organizationId, organizationId))).returning();
      if (!line) throw new TRPCError({ code: "NOT_FOUND", message: "Ligne de relevé introuvable." });
      return line;
    }),

  /** Rapprochement automatique : même montant, même sens, à ±7 jours. */
  autoMatch: protectedProcedure
    .input(z.object({}).default({}))
    .mutation(async ({ ctx }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager", "staff"]);
      const db = await requireDb();
      const [account] = await db.select().from(treasuryAccounts).where(and(eq(treasuryAccounts.organizationId, organizationId), eq(treasuryAccounts.type, "banque"))).limit(1);
      if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Aucun compte bancaire." });
      const lines = await db
        .select()
        .from(bankStatementLines)
        .where(and(eq(bankStatementLines.organizationId, organizationId), eq(bankStatementLines.accountId, account.id), isNull(bankStatementLines.matchedMovementId)));
      const movements = await db.select().from(treasuryMovements).where(and(eq(treasuryMovements.organizationId, organizationId), eq(treasuryMovements.accountId, account.id)));
      const taken = new Set(
        (await db.select({ matchedMovementId: bankStatementLines.matchedMovementId }).from(bankStatementLines).where(and(eq(bankStatementLines.organizationId, organizationId), eq(bankStatementLines.accountId, account.id))))
          .map((row) => row.matchedMovementId)
          .filter((id): id is number => id !== null),
      );
      let matched = 0;
      for (const line of lines) {
        const lineAmount = Number(line.amount);
        const candidate = movements.find((movement) => {
          if (taken.has(movement.id)) return false;
          const signed = movement.direction === "entree" ? Number(movement.amount) : -Number(movement.amount);
          if (Math.abs(signed - lineAmount) > 1) return false;
          return Math.abs(movement.createdAt.getTime() - new Date(line.statementDate).getTime()) / 86400000 <= 7;
        });
        if (candidate) {
          await db.update(bankStatementLines).set({ matchedMovementId: candidate.id }).where(eq(bankStatementLines.id, line.id));
          taken.add(candidate.id);
          matched += 1;
        }
      }
      return { matched } as const;
    }),

  /** Résumé du rapprochement : soldes + éléments non rapprochés. */
  reconciliationSummary: protectedProcedure.query(async ({ ctx }) => {
    const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager", "staff"]);
    const db = await requireDb();
    const [account] = await db.select().from(treasuryAccounts).where(and(eq(treasuryAccounts.organizationId, organizationId), eq(treasuryAccounts.type, "banque"))).limit(1);
    if (!account) return null;
    const movements = await db.select().from(treasuryMovements).where(and(eq(treasuryMovements.organizationId, organizationId), eq(treasuryMovements.accountId, account.id))).orderBy(desc(treasuryMovements.createdAt)).limit(60);
    const lines = await db.select().from(bankStatementLines).where(and(eq(bankStatementLines.organizationId, organizationId), eq(bankStatementLines.accountId, account.id))).orderBy(desc(bankStatementLines.statementDate)).limit(60);
    const matchedIds = new Set(lines.map((line) => line.matchedMovementId));
    const soldeLivres = round2(Number(account.openingBalance) + movements.reduce((sum, movement) => sum + (movement.direction === "entree" ? Number(movement.amount) : -Number(movement.amount)), 0));
    const soldeReleve = round2(lines.reduce((sum, line) => sum + Number(line.amount), 0));
    return {
      account,
      soldeLivres,
      soldeReleve,
      unmatchedMovements: movements
        .filter((movement) => !matchedIds.has(movement.id))
        .map((movement) => ({ id: movement.id, label: movement.label, amount: movement.direction === "entree" ? Number(movement.amount) : -Number(movement.amount), date: movement.createdAt })),
      unmatchedLines: lines
        .filter((line) => !line.matchedMovementId)
        .map((line) => ({ id: line.id, label: line.label, amount: Number(line.amount), date: line.statementDate })),
    };
  }),
});
