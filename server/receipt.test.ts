/**
 * Reçus clients PDF + e-mail (point 13) — générateur PDF sans dépendance,
 * contenu du reçu (articles, réduction parrainage, reste à payer), téléchargement
 * sur vente et commande en ligne, envoi e-mail en mode simulation journalisé.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

process.env.DATABASE_URL = "pglite://:memory:";
process.env.JWT_SECRET = "test-secret";
delete process.env.RESEND_API_KEY;
delete process.env.SMTP_HOST;

import { appRouter } from "./routers";
import { getDb, migrateDatabase } from "./db";
import { seed } from "./seed";
import { orders, receiptLogs, sales } from "../drizzle/schema";
import { buildPdf, buildReceiptPdf, escapePdfText, formatReceiptAmount, type ReceiptData } from "./domain/pdf";
import { sendEmail } from "./domain/email";
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

describe("générateur PDF (13)", () => {
  it("produit un PDF 1.4 valide avec table xref et polices WinAnsi", () => {
    const pdf = buildPdf([{ text: "Test reçu", size: 12, bold: true, align: "left", gapAfter: 4 }]);
    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.endsWith("%%EOF")).toBe(true);
    expect(text).toContain("/BaseFont /Helvetica-Bold");
    expect(text).toContain("/Encoding /WinAnsiEncoding");
    expect(text).toContain("xref");
    expect(text).toContain("(Test re\\347u) Tj"); // « ç » encodé en octal WinAnsi
  });

  it("échappe les caractères spéciaux et encode les accents", () => {
    expect(escapePdfText("Reçu (détail) \\ n°1")).toBe("Re\\347u \\(d\\351tail\\) \\\\ n\\2601");
    expect(escapePdfText("€")).toBe("\\200");
    // Typographie fine convertie en équivalents WinAnsi
    expect(escapePdfText("— – ' ")).toBe("- - ' ");
    expect(escapePdfText("\u202f")).toBe(" ");
  });

  it("formate les montants avec séparateurs et devise", () => {
    expect(formatReceiptAmount(125000, "XOF")).toBe("125 000 XOF");
    expect(formatReceiptAmount(14500.5, "XOF")).toBe("14 500,50 XOF");
  });

  it("construit un reçu complet : articles, réduction, reste à payer", () => {
    const data: ReceiptData = {
      brandName: "DISTINCTION",
      storeName: "Boutique Nyékonakpoè",
      title: "Reçu de vente",
      reference: "VTE-0002",
      date: new Date("2026-09-08T10:00:00Z"),
      currency: "XOF",
      customerName: "Moussa Koné",
      items: [
        { label: "Agbada Royale (L)", quantity: 1, unitPrice: 100000, total: 100000 },
        { label: "Sac Wax", quantity: 1, unitPrice: 15000, total: 15000 },
      ],
      discount: 10000,
      discountLabel: "Réduction parrainage (AMINATA10)",
      totalNet: 105000,
      payments: [
        { label: "Espèces", amount: 60000 },
        { label: "Mobile Money", amount: 35000 },
      ],
      shopUrl: "https://demo/boutique/distinction",
    };
    const pdf = buildReceiptPdf(data).toString("latin1");
    expect(pdf).toContain("(DISTINCTION) Tj");
    expect(pdf).toContain("VTE-0002"); // le ° du numéro est encodé en octal
    expect(pdf).toContain("Moussa Kon\\351"); // é encodé en octal WinAnsi
    expect(pdf).toMatch(/\(105\s000 XOF\) Tj/); // net à payer
    expect(pdf).toMatch(/\(- 10\s000 XOF\) Tj/); // réduction parrainage
    expect(pdf).toMatch(/\(10\s000 XOF\) Tj/); // reste à payer (105 000 − 95 000)
    expect(pdf).toContain("(Merci de votre confiance !) Tj");
  });
});

describe("reçus sur la base de démonstration (13)", () => {
  it("génère le PDF d'une vente et journalise le téléchargement", async () => {
    const db = (await getDb())!;
    const [sale] = await db.select().from(sales).limit(1);
    const result = await caller.receipts.salePdf({ saleId: sale.id });
    const binary = Buffer.from(result.base64, "base64").toString("latin1");
    expect(result.filename).toBe(`recu-${sale.reference}.pdf`);
    expect(binary.startsWith("%PDF-1.4")).toBe(true);
    expect(binary).toContain(sale.reference);
    const [log] = await db.select().from(receiptLogs).where(and(eq(receiptLogs.kind, "sale"), eq(receiptLogs.refId, sale.id)));
    expect(log?.status).toBe("telecharge");
  });

  it("génère le PDF d'une commande en ligne payée", async () => {
    const db = (await getDb())!;
    // Créer une commande en ligne réelle (le seed n'en contient pas).
    const publicCaller = appRouter.createCaller({ user: null, req: { protocol: "http", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });
    const catalog = await publicCaller.shop.catalog({ slug: "distinction" });
    const variant = catalog.products.find((p) => p.onlineAvailable > 0)!.variants[0];
    const zones = await publicCaller.shop.zones({ slug: "distinction" });
    const checkout = await publicCaller.shop.checkout({
      slug: "distinction",
      customer: { firstName: "Reçu", lastName: "Test", phone: "+228 90 00 00 01", email: "recu@test.tg" },
      deliveryZoneId: zones[0].id,
      items: [{ variantId: variant.id, quantity: 1, size: variant.size ?? undefined }],
    });
    await publicCaller.shop.confirmPayment({ paymentId: checkout.paymentId, method: "wave" });
    const [order] = await db.select().from(orders).where(eq(orders.channel, "en_ligne")).limit(1);
    expect(order).toBeDefined();
    const result = await caller.receipts.orderPdf({ orderId: order.id });
    const binary = Buffer.from(result.base64, "base64").toString("latin1");
    expect(binary.startsWith("%PDF-1.4")).toBe(true);
    expect(binary).toContain(order.reference);
  });

  it("envoie un reçu par e-mail en mode simulation (aucun fournisseur configuré)", async () => {
    const db = (await getDb())!;
    const [sale] = await db.select().from(sales).limit(1);
    const result = await caller.receipts.emailSale({ saleId: sale.id, to: "client@example.tg" });
    expect(result.status).toBe("simulation");
    expect(result.recipient).toBe("client@example.tg");
    const [log] = await db.select().from(receiptLogs).where(and(eq(receiptLogs.kind, "sale"), eq(receiptLogs.refId, sale.id), eq(receiptLogs.recipient, "client@example.tg")));
    expect(log?.status).toBe("simulation");
  });

  it("refuse l'envoi sans adresse e-mail connue", async () => {
    const db = (await getDb())!;
    const [sale] = await db.select().from(sales).limit(1);
    await expect(caller.receipts.emailSale({ saleId: sale.id, to: "pas-un-email" })).rejects.toThrow(/e-mail/);
    void db;
  });
});

describe("fournisseur d'e-mail (13)", () => {
  it("simule l'envoi quand aucun fournisseur n'est configuré", async () => {
    const result = await sendEmail({ to: "demo@example.tg", subject: "Test", text: "Bonjour" });
    expect(result.status).toBe("simulation");
  });
});
