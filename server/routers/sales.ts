/**
 * Caisse — ventes en boutique physique (point 7.1 de la présentation).
 *
 * Une vente combine plusieurs articles et plusieurs paiements : espèces dans
 * trois devises (devise locale + USD + EUR), mobile money, TPE, virement…
 * Le serveur recalcule toujours le total réglé, le reste à payer et la
 * monnaie à rendre. Chaque paiement alimente la trésorerie, le stock est
 * décrémenté, et une retouche éventuelle part automatiquement à l'atelier.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import {
  bonuses,
  employees,
  customers,
  exchangeRates,
  inventory,
  inventoryMovements,
  productionOrders,
  productVariants,
  products,
  referrals,
  organizations,
  saleItems,
  salePayments,
  sales,
  stores,
  treasuryAccounts,
  treasuryMovements,
} from "../../drizzle/schema";
import { listSales } from "../db";
import { requireOrganization } from "../guards";
import { requireDb, loadRates, makeReference } from "./shared";
import { applyReferralDiscount, computeSettlement, convert, toXof, type CurrencyCode, type PaymentInput } from "../domain/money";
import { bigSaleBonus } from "../domain/commissions";

const paymentInput = z.object({
  method: z.enum(["cash", "mobile_money", "tpe", "card", "transfer", "online"]),
  currency: z.enum(["XOF", "XAF", "USD", "EUR"]),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  reference: z.string().max(120).optional(),
  mobileNumber: z.string().max(40).optional(),
});

export const salesRouter = router({
  list: protectedProcedure.query(({ ctx }) => requireOrganization(ctx.user.id).then(({ organizationId }) => listSales(organizationId))),

  detail: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id);
      const db = await requireDb();
      const [sale] = await db
        .select()
        .from(sales)
        .where(and(eq(sales.id, input.id), eq(sales.organizationId, organizationId)))
        .limit(1);
      if (!sale) throw new TRPCError({ code: "NOT_FOUND", message: "Vente introuvable." });
      const items = await db
        .select({ item: saleItems, variant: productVariants, product: products })
        .from(saleItems)
        .innerJoin(productVariants, eq(saleItems.variantId, productVariants.id))
        .innerJoin(products, eq(productVariants.productId, products.id))
        .where(eq(saleItems.saleId, sale.id));
      const payments = await db.select().from(salePayments).where(eq(salePayments.saleId, sale.id));
      return { sale, items, payments };
    }),

  nextReference: protectedProcedure.query(async ({ ctx }) => {
    const { organizationId } = await requireOrganization(ctx.user.id);
    const db = await requireDb();
    const [row] = await db.select({ count: sql<number>`COUNT(*)` }).from(sales).where(eq(sales.organizationId, organizationId));
    return makeReference("VTE", Number(row?.count ?? 0));
  }),

  create: protectedProcedure
    .input(
      z.object({
        storeId: z.number().int().positive(),
        customerId: z.number().int().positive().optional(),
        reference: z.string().min(3).max(32).optional(),
        items: z
          .array(z.object({ variantId: z.number().int().positive(), quantity: z.number().int().positive().max(999), unitPrice: z.string().regex(/^\d+(\.\d{1,2})?$/) }))
          .min(1)
          .max(100),
        payments: z.array(paymentInput).max(12).default([]),
        referralCode: z.string().max(32).optional(),
        /** Note de retouche : déclenche une fiche atelier automatique. */
        retoucheNote: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager", "staff"]);
      const db = await requireDb();

      const [store] = await db
        .select()
        .from(stores)
        .where(and(eq(stores.id, input.storeId), eq(stores.organizationId, organizationId)))
        .limit(1);
      if (!store) throw new TRPCError({ code: "BAD_REQUEST", message: "La boutique n’appartient pas à votre marque." });
      if (input.customerId) {
        const [customer] = await db
          .select({ id: customers.id })
          .from(customers)
          .where(and(eq(customers.id, input.customerId), eq(customers.organizationId, organizationId)))
          .limit(1);
        if (!customer) throw new TRPCError({ code: "BAD_REQUEST", message: "Le client n’appartient pas à votre marque." });
      }

      // Articles : validation tenant + stock disponible + sous-total.
      let subtotal = 0;
      const stockRows = new Map<number, number>();
      for (const item of input.items) {
        const [variant] = await db
          .select({ id: productVariants.id, price: productVariants.price })
          .from(productVariants)
          .innerJoin(products, eq(productVariants.productId, products.id))
          .where(and(eq(productVariants.id, item.variantId), eq(products.organizationId, organizationId)))
          .limit(1);
        if (!variant) throw new TRPCError({ code: "BAD_REQUEST", message: "Une variante n’appartient pas à votre marque." });
        subtotal += Number(item.unitPrice) * item.quantity;
        if (!stockRows.has(item.variantId)) {
          const [row] = await db
            .select({ id: inventory.id, quantity: inventory.quantity })
            .from(inventory)
            .where(and(eq(inventory.storeId, store.id), eq(inventory.variantId, item.variantId)))
            .limit(1);
          stockRows.set(item.variantId, row?.quantity ?? 0);
        }
        const available = stockRows.get(item.variantId)!;
        if (available < item.quantity) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Stock insuffisant en boutique pour un des articles vendus." });
        }
        stockRows.set(item.variantId, available - item.quantity);
      }
      subtotal = Math.round(subtotal * 100) / 100;

      // Réduction parrain (point 5.5).
      let discount = 0;
      let referralCode: string | null = null;
      if (input.referralCode) {
        const code = input.referralCode.toUpperCase();
        const [referral] = await db
          .select()
          .from(referrals)
          .where(and(eq(referrals.organizationId, organizationId), eq(referrals.code, code), eq(referrals.active, true)))
          .limit(1);
        if (!referral) throw new TRPCError({ code: "BAD_REQUEST", message: "Code de parrainage invalide." });
        const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
        const applied = applyReferralDiscount(subtotal, Number(org?.referralCustomerRate ?? 10));
        discount = applied.discount;
        subtotal = applied.total;
        referralCode = code;
      }

      const rates = await loadRates();
      const payments: PaymentInput[] = input.payments.map((p) => ({ method: p.method, currency: p.currency as CurrencyCode, amount: Number(p.amount) }));
      const settlement = computeSettlement(subtotal, payments, store.currency, rates);
      if (!settlement.settled) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Paiement incomplet : reste à payer ${settlement.remain.toLocaleString("fr-FR")} ${store.currency}.`,
        });
      }

      const reference = input.reference ?? (await (async () => {
        const [row] = await db.select({ count: sql<number>`COUNT(*)` }).from(sales).where(eq(sales.organizationId, organizationId));
        return makeReference("VTE", Number(row?.count ?? 0));
      })());

      const [sale] = await db
        .insert(sales)
        .values({
          organizationId,
          storeId: store.id,
          customerId: input.customerId ?? null,
          sellerUserId: ctx.user.id,
          reference,
          totalAmount: String(settlement.total),
          discountAmount: String(discount),
          currency: store.currency,
          referralCode,
          status: "payee",
        })
        .returning();

      await db.insert(saleItems).values(input.items.map((item) => ({ saleId: sale.id, variantId: item.variantId, quantity: item.quantity, unitPrice: item.unitPrice })));
      if (payments.length) {
        await db.insert(salePayments).values(
          input.payments.map((p) => ({
            saleId: sale.id,
            method: p.method,
            currency: p.currency,
            amount: p.amount,
            reference: p.reference ?? null,
            mobileNumber: p.mobileNumber ?? null,
          })),
        );
      }

      // Décrément du stock boutique + journal des mouvements.
      for (const item of input.items) {
        const [row] = await db
          .select()
          .from(inventory)
          .where(and(eq(inventory.storeId, store.id), eq(inventory.variantId, item.variantId)))
          .limit(1);
        if (!row) continue;
        await db.update(inventory).set({ quantity: Math.max(row.quantity - item.quantity, 0), updatedAt: new Date() }).where(eq(inventory.id, row.id));
        await db.insert(inventoryMovements).values({
          organizationId,
          storeId: store.id,
          variantId: item.variantId,
          delta: -item.quantity,
          reason: "vente",
          note: reference,
          createdByUserId: ctx.user.id,
        });
      }

      // Trésorerie : un mouvement par paiement, vers la caisse du moyen utilisé.
      const accounts = await db.select().from(treasuryAccounts).where(eq(treasuryAccounts.organizationId, organizationId));
      const accountForMethod = (method: string) => {
        if (method === "cash") return accounts.find((a) => a.type === "caisse_boutique" && a.storeId === store.id);
        if (method === "mobile_money") return accounts.find((a) => a.type === "mobile_money");
        if (method === "tpe") return accounts.find((a) => a.type === "tpe");
        if (method === "online") return accounts.find((a) => a.type === "boutique_en_ligne");
        return accounts.find((a) => a.type === "banque");
      };
      const ensureAccount = async (method: string) => {
        let account = accountForMethod(method);
        if (!account) {
          const type = method === "mobile_money" ? "mobile_money" : method === "tpe" ? "tpe" : method === "online" ? "boutique_en_ligne" : method === "cash" ? "caisse_boutique" : "banque";
          const [created] = await db
            .insert(treasuryAccounts)
            .values({
              organizationId,
              type,
              storeId: method === "cash" ? store.id : null,
              label: method === "cash" ? `Caisse — ${store.name}` : method === "tpe" ? `Terminal TPE` : method === "mobile_money" ? "Mobile Money" : method === "online" ? "Boutique en ligne" : "Compte bancaire",
              currency: store.currency,
            })
            .onConflictDoNothing()
            .returning();
          account = created ?? (await db.select().from(treasuryAccounts).where(eq(treasuryAccounts.organizationId, organizationId))).find((a) => a.type === type);
        }
        return account;
      };
      for (const payment of input.payments) {
        const account = await ensureAccount(payment.method);
        if (!account) continue;
        const amountInAccountCurrency = convert(Number(payment.amount), payment.currency as CurrencyCode, account.currency, rates);
        await db.insert(treasuryMovements).values({
          organizationId,
          accountId: account.id,
          direction: "entree",
          amount: String(amountInAccountCurrency),
          currency: account.currency,
          category: "vente",
          refType: "sale",
          refId: sale.id,
          label: `${reference} · ${payment.method}`,
          createdByUserId: ctx.user.id,
        });
      }

      // Retouche → fiche atelier automatique (point 7.1).
      if (input.retoucheNote) {
        await db.insert(productionOrders).values({
          organizationId,
          type: "retouche",
          storeId: store.id,
          customerId: input.customerId ?? null,
          label: `Retouche ${reference}`,
          notes: input.retoucheNote,
          status: "ouverte",
        });
      }

      // Prime automatique « gros achat » (> 1 000 000 XOF, point 14.4).
      const totalXof = toXof(settlement.total, store.currency, rates);
      const bonusAmount = bigSaleBonus(totalXof);
      if (bonusAmount > 0) {
        const [sellerEmployee] = await db
          .select({ id: employees.id })
          .from(employees)
          .where(and(eq(employees.userId, ctx.user.id), eq(employees.organizationId, organizationId)))
          .limit(1);
        if (sellerEmployee) {
          await db.insert(bonuses).values({
            organizationId,
            employeeId: sellerEmployee.id,
            type: "gros_achat",
            amount: String(bonusAmount),
            note: `Vente ${reference} > 1 000 000 XOF (prime 2 %)`,
            awardedByUserId: ctx.user.id,
          });
        }
      }

      return {
        sale,
        settlement,
        /** Récapitulatif 3 devises pour le reçu (7.1). */
        threeCurrencies: {
          XOF: settlement.total,
          USD: convert(settlement.total, store.currency, "USD", rates),
          EUR: convert(settlement.total, store.currency, "EUR", rates),
        },
        storeCurrency: store.currency,
      };
    }),

  cancel: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager"]);
      const db = await requireDb();
      const result = await db
        .update(sales)
        .set({ status: "annulee" })
        .where(and(eq(sales.id, input.id), eq(sales.organizationId, organizationId)))
        .returning({ id: sales.id });
      return { success: result.length > 0 } as const;
    }),
});

/** Taux de change : consultation pour tous, mise à jour réservée à ENVOL. */
export const ratesRouter = router({
  get: protectedProcedure.query(async () => {
    const db = await requireDb();
    return db.select().from(exchangeRates).orderBy(exchangeRates.code);
  }),
  update: adminProcedure
    .input(z.object({ code: z.enum(["XOF", "XAF", "USD", "EUR"]), rateToXof: z.number().positive() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      await db
        .insert(exchangeRates)
        .values({ code: input.code, rateToXof: String(input.rateToXof) })
        .onConflictDoUpdate({ target: exchangeRates.code, set: { rateToXof: String(input.rateToXof), updatedAt: new Date() } });
      return { success: true } as const;
    }),
});
