/**
 * Boutique en ligne publique (point 5 de la présentation).
 *
 * Toutes les procédures sont publiques : la vitrine est visible par tout le
 * monde (5.1), le « Se connecter » du personnel reste sur /login. Le panier
 * affiche le stock agrégé des boutiques physiques (5.3) ; à la commande, la
 * boutique qui livre est choisie automatiquement (même ville d'abord, sinon
 * le plus grand stock) et une demande de fabrication part à l'atelier si
 * aucune boutique ne peut servir (5.3). Le paiement passe par Moneroo (5.6)
 * — en mode simulation tant que la clé API n'est pas configurée.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import {
  customers,
  deliveryZones,
  inventory,
  inventoryMovements,
  onlinePayments,
  orderItems,
  orders,
  organizations,
  productionOrders,
  productVariants,
  products,
  referrals,
  stores,
  treasuryAccounts,
  treasuryMovements,
} from "../../drizzle/schema";
import { requireOrganization } from "../guards";
import { requireDb, loadRates } from "./shared";
import { computeOnlineTotals, decrementStock, pickSourceStore, type CandidateStore } from "../domain/shop";
import { buildMonerooPayload, parseCheckoutUrl } from "../domain/payments";
import { ENV } from "../_core/env";
import { convert, type CurrencyCode } from "@shared/money";

async function getOrganizationBySlug(slug: string) {
  const db = await requireDb();
  const [organization] = await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1);
  if (!organization) throw new TRPCError({ code: "NOT_FOUND", message: "Boutique introuvable." });
  if (organization.plan !== "complet") {
    throw new TRPCError({ code: "NOT_FOUND", message: "Cette marque n’a pas activé la boutique en ligne." });
  }
  return organization;
}

export const shopRouter = router({
  /** En-tête public de la vitrine (5.1). */
  info: publicProcedure.input(z.object({ slug: z.string().min(2).max(96) })).query(async ({ input }) => {
    const organization = await getOrganizationBySlug(input.slug);
    return {
      name: organization.name,
      slug: organization.slug,
      logoUrl: organization.logoUrl,
      currency: organization.currency,
      referralCustomerRate: Number(organization.referralCustomerRate),
      referralAffiliateRate: Number(organization.referralAffiliateRate),
      customDomain: organization.customDomain,
    };
  }),

  /** Catalogue public avec stock agrégé des boutiques physiques (5.2 / 5.3). */
  catalog: publicProcedure.input(z.object({ slug: z.string().min(2).max(96) })).query(async ({ input }) => {
    const organization = await getOrganizationBySlug(input.slug);
    const db = await requireDb();
    const productRows = await db
      .select()
      .from(products)
      .where(and(eq(products.organizationId, organization.id), eq(products.isActive, true)))
      .orderBy(products.category, products.name);
    const variantRows = await db
      .select({ id: productVariants.id, productId: productVariants.productId, size: productVariants.size, color: productVariants.color, price: productVariants.price })
      .from(productVariants)
      .innerJoin(products, eq(productVariants.productId, products.id))
      .where(eq(products.organizationId, organization.id));
    const stockRows = await db
      .select({ variantId: inventory.variantId, quantity: sql<number>`COALESCE(SUM(${inventory.quantity}), 0)` })
      .from(inventory)
      .innerJoin(stores, eq(inventory.storeId, stores.id))
      .where(and(eq(inventory.organizationId, organization.id), eq(stores.kind, "boutique"), eq(stores.isActive, true)))
      .groupBy(inventory.variantId);
    const availability = new Map(stockRows.map((row) => [row.variantId, Number(row.quantity)]));

    return {
      organization: { id: organization.id, name: organization.name, slug: organization.slug, logoUrl: organization.logoUrl, currency: organization.currency, referralCustomerRate: Number(organization.referralCustomerRate) },
      products: productRows.map((product) => {
        const variants = variantRows
          .filter((variant) => variant.productId === product.id)
          .map((variant) => ({ id: variant.id, size: variant.size, color: variant.color, price: variant.price, available: availability.get(variant.id) ?? 0 }));
        const onlineAvailable = variants.reduce((sum, variant) => sum + variant.available, 0);
        return {
          id: product.id,
          name: product.name,
          family: product.family,
          category: product.category,
          genre: product.genre,
          gamme: product.gamme,
          sizes: (product.sizes ?? "").split(",").map((size) => size.trim()).filter(Boolean),
          basePrice: product.basePrice,
          description: product.description,
          variants,
          onlineAvailable,
        };
      }),
    };
  }),

  /** Zones de livraison actives avec leurs frais (5.4). */
  zones: publicProcedure.input(z.object({ slug: z.string().min(2).max(96) })).query(async ({ input }) => {
    const organization = await getOrganizationBySlug(input.slug);
    const db = await requireDb();
    return db
      .select()
      .from(deliveryZones)
      .where(and(eq(deliveryZones.organizationId, organization.id), eq(deliveryZones.isActive, true)))
      .orderBy(deliveryZones.kind, deliveryZones.name);
  }),

  /**
   * Passer la commande : valide le stock, choisit les boutiques qui livrent,
   * applique la réduction de parrainage, ajoute les frais de zone, crée le
   * client, la commande et la demande de paiement (5.5 / 5.6).
   */
  checkout: publicProcedure
    .input(
      z.object({
        slug: z.string().min(2).max(96),
        customer: z.object({
          firstName: z.string().min(1).max(80),
          lastName: z.string().min(1).max(80),
          phone: z.string().min(6).max(40),
          email: z.string().email().max(320),
          city: z.string().max(100).optional(),
          address: z.string().max(300).optional(),
        }),
        deliveryZoneId: z.number().int().positive(),
        referralCode: z.string().max(32).optional(),
        items: z
          .array(
            z.object({
              variantId: z.number().int().positive(),
              quantity: z.number().int().positive().max(50),
              size: z.string().max(32).optional(),
              color: z.string().max(64).optional(),
              customMeasurements: z.string().max(600).optional(),
            }),
          )
          .min(1)
          .max(30),
      }),
    )
    .mutation(async ({ input }) => {
      const organization = await getOrganizationBySlug(input.slug);
      const db = await requireDb();
      const orgCurrency = organization.currency as CurrencyCode;

      const [zone] = await db
        .select()
        .from(deliveryZones)
        .where(and(eq(deliveryZones.id, input.deliveryZoneId), eq(deliveryZones.organizationId, organization.id), eq(deliveryZones.isActive, true)))
        .limit(1);
      if (!zone) throw new TRPCError({ code: "BAD_REQUEST", message: "Zone de livraison indisponible." });

      // Catalogue + stock par boutique (5.3).
      const boutiqueStores = await db
        .select({ id: stores.id, city: stores.city })
        .from(stores)
        .where(and(eq(stores.organizationId, organization.id), eq(stores.kind, "boutique"), eq(stores.isActive, true)));
      const stockRows = await db
        .select({ storeId: inventory.storeId, variantId: inventory.variantId, quantity: inventory.quantity })
        .from(inventory)
        .innerJoin(stores, eq(inventory.storeId, stores.id))
        .where(and(eq(inventory.organizationId, organization.id), eq(stores.kind, "boutique"), eq(stores.isActive, true)));
      // Stock par variante ET par boutique : la ligne part de la boutique qui
      // détient réellement l'article choisi (5.3).
      const stockByVariant = new Map<number, Map<number, number>>();
      for (const row of stockRows) {
        let perStore = stockByVariant.get(row.variantId);
        if (!perStore) {
          perStore = new Map();
          stockByVariant.set(row.variantId, perStore);
        }
        perStore.set(row.storeId, (perStore.get(row.storeId) ?? 0) + row.quantity);
      }

      let subtotal = 0;
      const lines: Array<{ variantId: number; quantity: number; unitPrice: number; size?: string; color?: string; customMeasurements?: string; sourceStoreId: number | null; name: string }> = [];
      for (const item of input.items) {
        const [variant] = await db
          .select({ id: productVariants.id, price: productVariants.price, productId: productVariants.productId, size: productVariants.size, color: productVariants.color, productName: products.name })
          .from(productVariants)
          .innerJoin(products, eq(productVariants.productId, products.id))
          .where(and(eq(productVariants.id, item.variantId), eq(products.organizationId, organization.id), eq(products.isActive, true)))
          .limit(1);
        if (!variant) throw new TRPCError({ code: "BAD_REQUEST", message: "Un article du panier n’est plus disponible." });
        subtotal += Number(variant.price) * item.quantity;
        const variantStock = new Map(stockByVariant.get(item.variantId) ?? []);
        const sourceStoreId = pickSourceStore(zone.name, boutiqueStores as CandidateStore[], variantStock, item.quantity);
        if (sourceStoreId) decrementStock(variantStock, sourceStoreId, item.quantity);
        stockByVariant.set(item.variantId, variantStock);
        lines.push({
          variantId: item.variantId,
          quantity: item.quantity,
          unitPrice: Number(variant.price),
          size: item.size ?? variant.size ?? undefined,
          color: item.color ?? variant.color ?? undefined,
          customMeasurements: item.customMeasurements,
          sourceStoreId,
          name: variant.productName,
        });
      }
      subtotal = Math.round(subtotal * 100) / 100;

      // Réduction parrain (5.5) — le lien en ligne, la code en boutique.
      let referralCode: string | null = null;
      if (input.referralCode) {
        const code = input.referralCode.trim().toUpperCase();
        const [referral] = await db
          .select({ id: referrals.id })
          .from(referrals)
          .where(and(eq(referrals.organizationId, organization.id), eq(referrals.code, code), eq(referrals.active, true)))
          .limit(1);
        if (referral) referralCode = code;
      }
      const rates = await loadRates();
      const zoneFeeInOrgCurrency = convert(Number(zone.fee), zone.currency as CurrencyCode, orgCurrency, rates);
      const totals = computeOnlineTotals(subtotal, referralCode ? Number(organization.referralCustomerRate) : 0, zoneFeeInOrgCurrency);

      // Client : réutilisé si le téléphone existe déjà dans la marque.
      const phoneDigits = input.customer.phone.replace(/\D/g, "").slice(-9);
      let customerId: number | undefined;
      const existingCustomers = await db
        .select({ id: customers.id, phone: customers.phone })
        .from(customers)
        .where(eq(customers.organizationId, organization.id));
      customerId = existingCustomers.find((row) => (row.phone ?? "").replace(/\D/g, "").slice(-9) === phoneDigits)?.id;
      if (!customerId) {
        const [created] = await db
          .insert(customers)
          .values({
            organizationId: organization.id,
            firstName: input.customer.firstName,
            lastName: input.customer.lastName,
            email: input.customer.email,
            phone: input.customer.phone,
            city: input.customer.city ?? null,
          })
          .returning({ id: customers.id });
        customerId = created.id;
      }

      // Boutique « porteuse » de la commande : la première qui livre, sinon l'atelier.
      const [defaultStore] = await db
        .select({ id: stores.id, kind: stores.kind })
        .from(stores)
        .where(and(eq(stores.organizationId, organization.id), eq(stores.isActive, true)))
        .orderBy(sql`CASE WHEN ${stores.kind} = 'boutique' THEN 0 ELSE 1 END`, stores.id)
        .limit(1);
      if (!defaultStore) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "La marque n’a aucun établissement actif." });

      const [countRow] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(orders)
        .where(and(eq(orders.organizationId, organization.id), eq(orders.channel, "en_ligne")));
      const reference = `WEB-${String(Number(countRow?.count ?? 0) + 1).padStart(4, "0")}`;

      const measurements = lines.filter((line) => line.customMeasurements).map((line) => `${line.name} : ${line.customMeasurements}`);
      const unfulfilled = lines.filter((line) => !line.sourceStoreId);
      const notesParts = [
        ...lines.map((line) => `${line.quantity}× ${line.name} (${[line.size, line.color].filter(Boolean).join(", ") || "article"})`),
        ...(measurements.length ? [`Mensurations client : ${measurements.join(" · ")}`] : []),
        ...(unfulfilled.length ? [`À fabriquer : ${unfulfilled.map((line) => `${line.quantity}× ${line.name}`).join(", ")}`] : []),
      ];

      const [order] = await db
        .insert(orders)
        .values({
          organizationId: organization.id,
          storeId: defaultStore.id,
          customerId,
          reference,
          status: "pending",
          totalAmount: String(totals.total),
          notes: notesParts.join(" · ").slice(0, 2000),
          channel: "en_ligne",
          paymentStatus: "impaye",
          referralCode,
          deliveryZoneId: zone.id,
          deliveryFee: String(totals.deliveryFee),
          deliveryName: `${input.customer.firstName} ${input.customer.lastName}`,
          deliveryPhone: input.customer.phone,
          deliveryAddress: [input.customer.address, input.customer.city].filter(Boolean).join(", ") || null,
        })
        .returning();

      await db.insert(orderItems).values(lines.map((line) => ({ orderId: order.id, variantId: line.variantId, quantity: line.quantity, unitPrice: String(line.unitPrice) })));

      // Décrément du stock des boutiques qui livrent + journal.
      for (const line of lines) {
        if (!line.sourceStoreId) continue;
        const [row] = await db
          .select()
          .from(inventory)
          .where(and(eq(inventory.storeId, line.sourceStoreId), eq(inventory.variantId, line.variantId)))
          .limit(1);
        if (!row) continue;
        await db.update(inventory).set({ quantity: Math.max(row.quantity - line.quantity, 0), updatedAt: new Date() }).where(eq(inventory.id, row.id));
        await db.insert(inventoryMovements).values({
          organizationId: organization.id,
          storeId: line.sourceStoreId,
          variantId: line.variantId,
          delta: -line.quantity,
          reason: "vente_en_ligne",
          note: reference,
        });
      }

      // Rupture : demande de fabrication automatique à l'atelier (5.3).
      if (unfulfilled.length) {
        await db.insert(productionOrders).values({
          organizationId: organization.id,
          type: "commande",
          orderId: order.id,
          storeId: defaultStore.id,
          customerId,
          label: `Commande en ligne ${reference} — ${input.customer.firstName} ${input.customer.lastName}`,
          measurements: measurements.join(" · ").slice(0, 900) || null,
          notes: `Fabrication à la demande : ${unfulfilled.map((line) => `${line.quantity}× ${line.name}`).join(", ")}`,
        });
      }

      // Demande de paiement Moneroo (5.6) — simulation sans clé API.
      const mode = ENV.monerooApiKey ? "live" : "simulation";
      const [payment] = await db
        .insert(onlinePayments)
        .values({
          organizationId: organization.id,
          orderId: order.id,
          provider: "moneroo",
          mode,
          amount: String(totals.total),
          currency: orgCurrency,
          customerEmail: input.customer.email,
        })
        .returning();

      let checkoutUrl = `/boutique/${organization.slug}/paiement/${payment.id}`;
      if (mode === "live") {
        try {
          const payload = buildMonerooPayload({
            paymentId: payment.id,
            amount: totals.total,
            currency: orgCurrency,
            customer: { email: input.customer.email, firstName: input.customer.firstName, lastName: input.customer.lastName },
            orderReference: reference,
            returnUrl: `${organization.shopUrl ?? ""}/boutique/${organization.slug}/paiement/${payment.id}`,
          });
          const response = await fetch("https://api.moneroo.io/v1/payments", {
            method: "POST",
            headers: { Authorization: `Bearer ${ENV.monerooApiKey}`, "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(payload),
          });
          const body = await response.json().catch(() => null);
          const remoteUrl = parseCheckoutUrl(body);
          if (remoteUrl) {
            checkoutUrl = remoteUrl;
            await db.update(onlinePayments).set({ providerRef: String((body as Record<string, unknown>)?.id ?? null), checkoutUrl: remoteUrl }).where(eq(onlinePayments.id, payment.id));
          } else {
            await db.update(onlinePayments).set({ mode: "simulation" }).where(eq(onlinePayments.id, payment.id));
          }
        } catch {
          // Moneroo injoignable : bascule en simulation pour ne pas bloquer la vente.
          await db.update(onlinePayments).set({ mode: "simulation" }).where(eq(onlinePayments.id, payment.id));
        }
      } else {
        await db.update(onlinePayments).set({ checkoutUrl }).where(eq(onlinePayments.id, payment.id));
      }

      return { orderId: order.id, reference, total: totals.total, currency: orgCurrency, paymentId: payment.id, checkoutUrl, mode };
    }),

  /** État du paiement, pour la page de caisse sécurisée. */
  payment: publicProcedure.input(z.object({ paymentId: z.number().int().positive() })).query(async ({ input }) => {
    const db = await requireDb();
    const [payment] = await db.select().from(onlinePayments).where(eq(onlinePayments.id, input.paymentId)).limit(1);
    if (!payment) throw new TRPCError({ code: "NOT_FOUND", message: "Paiement introuvable." });
    const [order] = await db.select().from(orders).where(eq(orders.id, payment.orderId)).limit(1);
    const [organization] = await db.select().from(organizations).where(eq(organizations.id, payment.organizationId)).limit(1);
    return {
      payment: { id: payment.id, amount: payment.amount, currency: payment.currency, status: payment.status, mode: payment.mode },
      order: { reference: order?.reference ?? "", totalAmount: order?.totalAmount ?? payment.amount, currency: payment.currency, deliveryName: order?.deliveryName ?? "" },
      organization: { name: organization?.name ?? "", slug: organization?.slug ?? "" },
    };
  }),

  /** Confirme un paiement en mode simulation (en production : webhook Moneroo). */
  confirmPayment: publicProcedure
    .input(z.object({ paymentId: z.number().int().positive(), method: z.string().min(2).max(60).default("mobile_money"), mobileNumber: z.string().max(40).optional() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [payment] = await db.select().from(onlinePayments).where(eq(onlinePayments.id, input.paymentId)).limit(1);
      if (!payment) throw new TRPCError({ code: "NOT_FOUND", message: "Paiement introuvable." });
      if (payment.mode !== "simulation") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Ce paiement est réglé via la caisse Moneroo." });
      }
      if (payment.status === "succes") {
        return { success: true, alreadyPaid: true } as const;
      }
      await markOnlinePaymentSucceeded(db, payment.id, `SIM-${payment.id}`);
      const [order] = await db.select().from(orders).where(eq(orders.id, payment.orderId)).limit(1);
      return { success: true, alreadyPaid: false, reference: order?.reference } as const;
    }),

  /** Suivi de commande publique par référence. */
  orderStatus: publicProcedure
    .input(z.object({ slug: z.string().min(2).max(96), reference: z.string().min(3).max(32) }))
    .query(async ({ input }) => {
      const organization = await getOrganizationBySlug(input.slug);
      const db = await requireDb();
      const [order] = await db
        .select({ reference: orders.reference, status: orders.status, paymentStatus: orders.paymentStatus, totalAmount: orders.totalAmount, createdAt: orders.createdAt })
        .from(orders)
        .where(and(eq(orders.organizationId, organization.id), eq(orders.reference, input.reference.toUpperCase())))
        .limit(1);
      return order ?? null;
    }),
});

/** Marque un paiement en ligne comme réglé : commande payée + trésorerie (5.6). */
export async function markOnlinePaymentSucceeded(db: NonNullable<Awaited<ReturnType<typeof requireDb>>>, paymentId: number, providerRef: string | null) {
  const [payment] = await db.select().from(onlinePayments).where(eq(onlinePayments.id, paymentId)).limit(1);
  if (!payment || payment.status === "succes") return;
  await db.update(onlinePayments).set({ status: "succes", paidAt: new Date(), providerRef: providerRef ?? payment.providerRef }).where(eq(onlinePayments.id, payment.id));
  await db.update(orders).set({ paymentStatus: "paye", status: "confirmed", updatedAt: new Date() }).where(and(eq(orders.id, payment.orderId), eq(orders.paymentStatus, "impaye")));

  const [account] = await db
    .select()
    .from(treasuryAccounts)
    .where(and(eq(treasuryAccounts.organizationId, payment.organizationId), eq(treasuryAccounts.type, "boutique_en_ligne")))
    .limit(1);
  let accountId = account?.id;
  if (!accountId) {
    const [created] = await db
      .insert(treasuryAccounts)
      .values({ organizationId: payment.organizationId, type: "boutique_en_ligne", label: "Boutique en ligne (Moneroo)", currency: payment.currency })
      .onConflictDoNothing()
      .returning({ id: treasuryAccounts.id });
    accountId = created?.id;
  }
  if (accountId) {
    await db.insert(treasuryMovements).values({
      organizationId: payment.organizationId,
      accountId,
      direction: "entree",
      amount: payment.amount,
      currency: payment.currency,
      category: "vente",
      refType: "online_payment",
      refId: payment.id,
      label: `Vente en ligne — paiement ${providerRef ?? payment.id}`,
    });
  }
}

/**
 * Vérifie la signature du webhook Moneroo (HMAC-SHA512 du corps brut avec le
 * secret webhook) — à comparer à l'en-tête `x-moneroo-signature`.
 */
export function verifyMonerooSignature(rawBody: Buffer | string, signature: string | undefined): boolean {
  // Lecture dynamique : le secret peut être configuré après le démarrage (tests, hot reload).
  if (!process.env.MONEROO_WEBHOOK_SECRET) return false;
  if (!signature) return false;
  const expected = createHmac("sha512", process.env.MONEROO_WEBHOOK_SECRET).update(rawBody).digest("hex");
  const provided = signature.trim().replace(/^sha512=/, "");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ------------------------------------------------------------------ */
/* Administration des zones de livraison (côté marque)                 */
/* ------------------------------------------------------------------ */

export const deliveryRouter = router({
  zones: protectedProcedure.query(async ({ ctx }) => {
    const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager", "staff"]);
    const db = await requireDb();
    return db.select().from(deliveryZones).where(eq(deliveryZones.organizationId, organizationId)).orderBy(deliveryZones.kind, deliveryZones.name);
  }),

  createZone: protectedProcedure
    .input(
      z.object({
        name: z.string().min(2).max(120),
        kind: z.enum(["locale", "internationale"]).default("locale"),
        fee: z.string().regex(/^\d+(\.\d{1,2})?$/),
        etaDays: z.number().int().min(0).max(90).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager"]);
      const db = await requireDb();
      const [zone] = await db
        .insert(deliveryZones)
        .values({
          organizationId,
          name: input.name,
          kind: input.kind,
          fee: input.fee,
          etaDays: input.etaDays ?? null,
        })
        .onConflictDoNothing()
        .returning();
      if (!zone) throw new TRPCError({ code: "CONFLICT", message: "Une zone porte déjà ce nom." });
      return zone;
    }),

  updateZone: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), name: z.string().min(2).max(120).optional(), fee: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(), isActive: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager"]);
      const db = await requireDb();
      const result = await db
        .update(deliveryZones)
        .set({
          ...(input.name ? { name: input.name } : {}),
          ...(input.fee ? { fee: input.fee } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        })
        .where(and(eq(deliveryZones.id, input.id), eq(deliveryZones.organizationId, organizationId)))
        .returning({ id: deliveryZones.id });
      return { success: result.length > 0 } as const;
    }),
});
