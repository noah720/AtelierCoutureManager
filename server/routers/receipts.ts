/**
 * Reçus clients en PDF + envoi par e-mail (point 13 de la présentation).
 *
 * Le PDF est généré à la demande (zéro dépendance) ; l'envoi part par Resend
 * ou SMTP si configuré, sinon il est simulé et journalisé — le reçu reste
 * toujours téléchargeable depuis l'interface.
 */
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { requireDb } from "./shared";
import { requireOrganization } from "../guards";
import {
  customers,
  deliveryZones,
  onlinePayments,
  orders,
  orderItems,
  productVariants,
  products,
  receiptLogs,
  saleItems,
  salePayments,
  sales,
  stores,
  organizations,
} from "../../drizzle/schema";
import { buildReceiptPdf, type ReceiptData } from "../domain/pdf";
import { sendEmail } from "../domain/email";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const METHOD_LABELS: Record<string, string> = {
  cash: "Espèces",
  mobile_money: "Mobile Money",
  tpe: "Carte (TPE)",
  card: "Carte bancaire",
  transfer: "Virement",
  online: "Paiement en ligne",
};

export const receiptsRouter = router({
  /** Journal des reçus émis (téléchargements + envois). */
  logs: protectedProcedure.query(async ({ ctx }) => {
    const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager", "staff"]);
    const db = await requireDb();
    return db.select().from(receiptLogs).where(eq(receiptLogs.organizationId, organizationId)).orderBy(desc(receiptLogs.createdAt)).limit(30);
  }),

  /** PDF d'une vente boutique (base64). */
  salePdf: protectedProcedure
    .input(z.object({ saleId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager", "staff"]);
      const db = await requireDb();
      const [sale] = await db.select().from(sales).where(and(eq(sales.id, input.saleId), eq(sales.organizationId, organizationId))).limit(1);
      if (!sale) throw new TRPCError({ code: "NOT_FOUND", message: "Vente introuvable." });
      const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
      const [store] = await db.select().from(stores).where(eq(stores.id, sale.storeId)).limit(1);
      const items = await db
        .select({ quantity: saleItems.quantity, unitPrice: saleItems.unitPrice, size: productVariants.size, color: productVariants.color, productName: products.name })
        .from(saleItems)
        .innerJoin(productVariants, eq(saleItems.variantId, productVariants.id))
        .innerJoin(products, eq(productVariants.productId, products.id))
        .where(eq(saleItems.saleId, sale.id));
      const payments = await db.select().from(salePayments).where(eq(salePayments.saleId, sale.id));
      const customer = sale.customerId ? (await db.select().from(customers).where(eq(customers.id, sale.customerId)).limit(1))[0] : null;
      const gross = items.reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0);
      const data: ReceiptData = {
        brandName: org?.name ?? "Atelier",
        brandAddress: store ? `${store.name}${store.city ? ` — ${store.city}` : ""}` : null,
        storeName: null,
        title: "Reçu de vente",
        reference: sale.reference,
        date: sale.createdAt,
        currency: sale.currency,
        customerName: customer ? `${customer.firstName} ${customer.lastName}` : null,
        customerPhone: customer?.phone ?? null,
        items: items.map((item) => ({
          label: `${item.productName}${item.size ? ` (${item.size}${item.color ? ` · ${item.color}` : ""})` : ""}`,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          total: Number(item.unitPrice) * item.quantity,
        })),
        discount: gross - Number(sale.totalAmount) + (Number(sale.discountAmount) || 0) > 0.01 ? gross - Number(sale.totalAmount) + (Number(sale.discountAmount) || 0) : Number(sale.discountAmount) || 0,
        discountLabel: sale.referralCode ? `Réduction parrainage (${sale.referralCode})` : "Réduction",
        totalNet: Number(sale.totalAmount),
        payments: payments.map((payment) => ({ label: METHOD_LABELS[payment.method] ?? payment.method, amount: Number(payment.amount) })),
      };
      const pdf = buildReceiptPdf(data);
      await db.insert(receiptLogs).values({ organizationId, kind: "sale", refId: sale.id, reference: sale.reference, status: "telecharge", sentByUserId: ctx.user.id });
      return { filename: `recu-${sale.reference}.pdf`, base64: pdf.toString("base64") };
    }),

  /** PDF d'une commande en ligne (base64). */
  orderPdf: protectedProcedure
    .input(z.object({ orderId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager", "staff"]);
      const db = await requireDb();
      const [order] = await db.select().from(orders).where(and(eq(orders.id, input.orderId), eq(orders.organizationId, organizationId))).limit(1);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Commande introuvable." });
      const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
      const [store] = await db.select().from(stores).where(eq(stores.id, order.storeId)).limit(1);
      const items = await db
        .select({ quantity: orderItems.quantity, unitPrice: orderItems.unitPrice, size: productVariants.size, color: productVariants.color, productName: products.name })
        .from(orderItems)
        .innerJoin(productVariants, eq(orderItems.variantId, productVariants.id))
        .innerJoin(products, eq(productVariants.productId, products.id))
        .where(eq(orderItems.orderId, order.id));
      const [payment] = await db.select().from(onlinePayments).where(eq(onlinePayments.orderId, order.id)).limit(1);
      const currency = payment?.currency ?? org?.currency ?? "XOF";
      const zone = order.deliveryZoneId ? (await db.select().from(deliveryZones).where(eq(deliveryZones.id, order.deliveryZoneId)).limit(1))[0] : null;
      const gross = items.reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0);
      const deliveryFee = Number(order.deliveryFee);
      const data: ReceiptData = {
        brandName: org?.name ?? "Atelier",
        brandAddress: store ? `${store.name}${store.city ? ` — ${store.city}` : ""}` : null,
        title: "Reçu de commande en ligne",
        reference: order.reference,
        date: order.createdAt,
        currency,
        customerName: order.deliveryName ?? null,
        customerPhone: order.deliveryPhone ?? null,
        items: items.map((item) => ({
          label: `${item.productName}${item.size ? ` (${item.size}${item.color ? ` · ${item.color}` : ""})` : ""}`,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          total: Number(item.unitPrice) * item.quantity,
        })),
        deliveryFee,
        deliveryLabel: zone ? `Livraison ${zone.name}` : "Frais de livraison",
        discount: gross + deliveryFee - Number(order.totalAmount) > 0.01 ? gross + deliveryFee - Number(order.totalAmount) : 0,
        discountLabel: order.referralCode ? `Réduction parrainage (${order.referralCode})` : "Réduction",
        totalNet: Number(order.totalAmount),
        payments: payment && payment.status === "succes" ? [{ label: `Paiement en ligne (${payment.provider})`, amount: Number(payment.amount) }] : [],
        shopUrl: org?.shopUrl ?? null,
      };
      const pdf = buildReceiptPdf(data);
      await db.insert(receiptLogs).values({ organizationId, kind: "order", refId: order.id, reference: order.reference, status: "telecharge", sentByUserId: ctx.user.id });
      return { filename: `recu-${order.reference}.pdf`, base64: pdf.toString("base64") };
    }),

  /** Envoie le reçu d'une vente par e-mail (au client, ou à l'adresse fournie). */
  emailSale: protectedProcedure
    .input(z.object({ saleId: z.number().int().positive(), to: z.string().max(320).optional() }))
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager", "staff"]);
      const db = await requireDb();
      const [sale] = await db.select().from(sales).where(and(eq(sales.id, input.saleId), eq(sales.organizationId, organizationId))).limit(1);
      if (!sale) throw new TRPCError({ code: "NOT_FOUND", message: "Vente introuvable." });
      const customer = sale.customerId ? (await db.select().from(customers).where(eq(customers.id, sale.customerId)).limit(1))[0] : null;
      const recipient = (input.to ?? customer?.email ?? "").trim();
      if (!recipient || !EMAIL_RE.test(recipient)) throw new TRPCError({ code: "BAD_REQUEST", message: "Adresse e-mail du client inconnue — renseignez-la pour envoyer le reçu." });
      const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
      const items = await db
        .select({ quantity: saleItems.quantity, unitPrice: saleItems.unitPrice, size: productVariants.size, color: productVariants.color, productName: products.name })
        .from(saleItems)
        .innerJoin(productVariants, eq(saleItems.variantId, productVariants.id))
        .innerJoin(products, eq(productVariants.productId, products.id))
        .where(eq(saleItems.saleId, sale.id));
      const payments = await db.select().from(salePayments).where(eq(salePayments.saleId, sale.id));
      const gross = items.reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0);
      const discount = gross - Number(sale.totalAmount) > 0.01 ? gross - Number(sale.totalAmount) : 0;
      const pdf = buildReceiptPdf({
        brandName: org?.name ?? "Atelier",
        title: "Reçu de vente",
        reference: sale.reference,
        date: sale.createdAt,
        currency: sale.currency,
        customerName: customer ? `${customer.firstName} ${customer.lastName}` : null,
        customerPhone: customer?.phone ?? null,
        items: items.map((item) => ({ label: item.productName, quantity: item.quantity, unitPrice: Number(item.unitPrice), total: Number(item.unitPrice) * item.quantity })),
        discount,
        discountLabel: sale.referralCode ? `Réduction parrainage (${sale.referralCode})` : "Réduction",
        totalNet: Number(sale.totalAmount),
        payments: payments.map((payment) => ({ label: METHOD_LABELS[payment.method] ?? payment.method, amount: Number(payment.amount) })),
      });
      const subject = `Votre reçu ${sale.reference} — ${org?.name ?? "Atelier"}`;
      const result = await sendEmail({
        to: recipient,
        subject,
        text: `Bonjour${customer ? ` ${customer.firstName}` : ""},\n\nVeuillez trouver en pièce jointe le reçu de votre achat ${sale.reference}.\n\nMerci de votre confiance !\n${org?.name ?? ""}`,
        attachment: { filename: `recu-${sale.reference}.pdf`, base64: pdf.toString("base64") },
      });
      await db.insert(receiptLogs).values({ organizationId, kind: "sale", refId: sale.id, reference: sale.reference, recipient, status: result.status, detail: result.detail ?? null, sentByUserId: ctx.user.id });
      return { status: result.status, detail: result.detail ?? null, recipient } as const;
    }),

  /** Envoie le reçu d'une commande en ligne par e-mail. */
  emailOrder: protectedProcedure
    .input(z.object({ orderId: z.number().int().positive(), to: z.string().max(320).optional() }))
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager", "staff"]);
      const db = await requireDb();
      const [order] = await db.select().from(orders).where(and(eq(orders.id, input.orderId), eq(orders.organizationId, organizationId))).limit(1);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Commande introuvable." });
      const [paymentRow] = await db.select().from(onlinePayments).where(eq(onlinePayments.orderId, order.id)).limit(1);
      const recipient = (input.to ?? paymentRow?.customerEmail ?? "").trim();
      if (!recipient || !EMAIL_RE.test(recipient)) throw new TRPCError({ code: "BAD_REQUEST", message: "Adresse e-mail du client inconnue — renseignez-la pour envoyer le reçu." });
      const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
      const items = await db
        .select({ quantity: orderItems.quantity, unitPrice: orderItems.unitPrice, productName: products.name, size: productVariants.size })
        .from(orderItems)
        .innerJoin(productVariants, eq(orderItems.variantId, productVariants.id))
        .innerJoin(products, eq(productVariants.productId, products.id))
        .where(eq(orderItems.orderId, order.id));
      const [payment] = await db.select().from(onlinePayments).where(eq(onlinePayments.orderId, order.id)).limit(1);
      const currency = payment?.currency ?? "XOF";
      const deliveryFee = Number(order.deliveryFee);
      const gross = items.reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0);
      const discount = gross + deliveryFee - Number(order.totalAmount) > 0.01 ? gross + deliveryFee - Number(order.totalAmount) : 0;
      const pdf = buildReceiptPdf({
        brandName: org?.name ?? "Atelier",
        title: "Reçu de commande en ligne",
        reference: order.reference,
        date: order.createdAt,
        currency,
        customerName: order.deliveryName ?? null,
        customerPhone: order.deliveryPhone ?? null,
        items: items.map((item) => ({ label: item.productName, quantity: item.quantity, unitPrice: Number(item.unitPrice), total: Number(item.unitPrice) * item.quantity })),
        deliveryFee,
        deliveryLabel: "Frais de livraison",
        discount,
        discountLabel: order.referralCode ? `Réduction parrainage (${order.referralCode})` : "Réduction",
        totalNet: Number(order.totalAmount),
        payments: payment && payment.status === "succes" ? [{ label: "Paiement en ligne", amount: Number(payment.amount) }] : [],
        shopUrl: org?.shopUrl ?? null,
      });
      const subject = `Votre reçu ${order.reference} — ${org?.name ?? "Atelier"}`;
      const result = await sendEmail({
        to: recipient,
        subject,
        text: `Bonjour ${order.deliveryName ?? ""},\n\nVeuillez trouver en pièce jointe le reçu de votre commande ${order.reference}.\n\nMerci de votre confiance !\n${org?.name ?? ""}`,
        attachment: { filename: `recu-${order.reference}.pdf`, base64: pdf.toString("base64") },
      });
      await db.insert(receiptLogs).values({ organizationId, kind: "order", refId: order.id, reference: order.reference, recipient, status: result.status, detail: result.detail ?? null, sentByUserId: ctx.user.id });
      return { status: result.status, detail: result.detail ?? null, recipient } as const;
    }),
});
