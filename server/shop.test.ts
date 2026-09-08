/**
 * Parcours complet de la boutique en ligne (point 5) sur un PostgreSQL
 * embarqué en mémoire : vitrine, panier, checkout, stock agrégé, choix de la
 * boutique qui livre, réduction de parrainage, frais de zone, fabrication à
 * la demande en cas de rupture, paiement simulé et trésorerie.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

process.env.DATABASE_URL = "pglite://:memory:";
process.env.JWT_SECRET = "test-secret";

import { appRouter } from "./routers";
import { getDb, migrateDatabase } from "./db";
import { seed } from "./seed";
import { deliveryZones, inventory, onlinePayments, orders, productionOrders, treasuryMovements } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const publicCaller = appRouter.createCaller({
  user: null,
  req: { protocol: "http", headers: {} } as TrpcContext["req"],
  res: {} as TrpcContext["res"],
});

beforeAll(async () => {
  await migrateDatabase();
  await seed();
});

describe("boutique en ligne — parcours d'achat complet (5)", () => {
  it("expose la vitrine publique d'une marque formule complète", async () => {
    const catalog = await publicCaller.shop.catalog({ slug: "distinction" });
    expect(catalog.organization.name).toBe("DISTINCTION");
    expect(catalog.products.length).toBeGreaterThan(10);
    const zones = await publicCaller.shop.zones({ slug: "distinction" });
    expect(zones.map((zone) => zone.name)).toContain("Lomé");
    expect(zones.map((zone) => zone.name)).toContain("International (DHL)");
  });

  it("refuse la vitrine d'une marque sans formule complète", async () => {
    const db = await getDb();
    await db!.insert((await import("../drizzle/schema")).organizations).values({
      name: "Petite Boutique",
      slug: "petite-boutique",
      plan: "boutique",
      trialEndsAt: new Date(Date.now() + 86400000),
    });
    await expect(publicCaller.shop.catalog({ slug: "petite-boutique" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("encaisse une commande : stock décrémenté, réduction parrain, frais de zone, paiement simulé", async () => {
    const catalog = await publicCaller.shop.catalog({ slug: "distinction" });
    const zones = await publicCaller.shop.zones({ slug: "distinction" });
    const lome = zones.find((zone) => zone.name === "Lomé")!;
    const stocked = catalog.products.find((product) => product.onlineAvailable > 0)!;
    const variant = stocked.variants.find((row) => row.available > 0)!;

    const before = await stockOf(variant.id);
    const subtotal = Number(variant.price);
    const expectedTotal = Math.round((subtotal * 0.9 + Number(lome.fee)) * 100) / 100; // −10 % parrain + livraison Lomé

    const result = await publicCaller.shop.checkout({
      slug: "distinction",
      customer: { firstName: "Awa", lastName: "Toure", phone: "+228 92 34 56 78", email: "awa@example.tg", city: "Lomé", address: "Bè Kpota" },
      deliveryZoneId: lome.id,
      referralCode: "AMINATA10",
      items: [{ variantId: variant.id, quantity: 1, size: variant.size ?? undefined }],
    });

    expect(result.reference).toMatch(/^WEB-0001$/);
    expect(result.total).toBeCloseTo(expectedTotal, 0);
    expect(result.mode).toBe("simulation");

    // Stock de la boutique source décrémenté.
    expect(await stockOf(variant.id)).toBe(before - 1);

    // Paiement en attente, commande impayée.
    const db = await getDb();
    const [payment] = await db!.select().from(onlinePayments).where(eq(onlinePayments.id, result.paymentId));
    expect(payment.status).toBe("en_attente");
    const [order] = await db!.select().from(orders).where(eq(orders.id, result.orderId));
    expect(order.channel).toBe("en_ligne");
    expect(order.paymentStatus).toBe("impaye");
    expect(order.referralCode).toBe("AMINATA10");
    expect(Number(order.deliveryFee)).toBe(Number(lome.fee));

    // Confirmation du paiement (page de caisse simulée).
    const confirmation = await publicCaller.shop.confirmPayment({ paymentId: payment.id, method: "mtn", mobileNumber: "+228 92 34 56 78" });
    expect(confirmation.success).toBe(true);
    const [paidOrder] = await db!.select().from(orders).where(eq(orders.id, result.orderId));
    expect(paidOrder.paymentStatus).toBe("paye");
    expect(paidOrder.status).toBe("confirmed");
    // Mouvement de trésorerie généré sur le compte boutique en ligne.
    const movements = await db!.select().from(treasuryMovements).where(and(eq(treasuryMovements.refType, "online_payment"), eq(treasuryMovements.refId, payment.id)));
    expect(movements).toHaveLength(1);
    expect(Number(movements[0].amount)).toBeCloseTo(expectedTotal, 0);
  });

  it("envoie à l'atelier une demande de fabrication quand aucune boutique ne peut servir", async () => {
    const catalog = await publicCaller.shop.catalog({ slug: "distinction" });
    const zones = await publicCaller.shop.zones({ slug: "distinction" });
    const dakar = zones.find((zone) => zone.name === "Dakar")!;
    const variant = catalog.products.find((product) => product.onlineAvailable > 0)!.variants[0];

    const before = await productionCount();
    const result = await publicCaller.shop.checkout({
      slug: "distinction",
      customer: { firstName: "Ibrahima", lastName: "Diallo", phone: "+221 78 123 45 67", email: "ibrahima@example.sn" },
      deliveryZoneId: dakar.id,
      items: [{ variantId: variant.id, quantity: 50, customMeasurements: "Poitrine 105, longueur 120" }],
    });

    expect(result.reference).toMatch(/^WEB-0002$/);
    expect(await productionCount()).toBe(before + 1);
    const db = await getDb();
    const [fiche] = await db!.select().from(productionOrders).where(eq(productionOrders.orderId, result.orderId));
    expect(fiche.label).toContain("WEB-0002");
    expect(fiche.notes).toContain("Fabrication à la demande");
    expect(fiche.measurements).toContain("Poitrine 105");
    // Rien n'a été décrémenté (rupture) et la commande attend son paiement.
    const [order] = await db!.select().from(orders).where(eq(orders.id, result.orderId));
    expect(order.paymentStatus).toBe("impaye");
  });

  it("refuse le paiement simulé pour une commande déjà réglée et protège le webhook", async () => {
    const db = await getDb();
    const payments = await db!.select().from(onlinePayments);
    const paid = payments.find((payment) => payment.status === "succes")!;
    const again = await publicCaller.shop.confirmPayment({ paymentId: paid.id, method: "mtn" });
    expect(again.alreadyPaid).toBe(true);

    const { verifyMonerooSignature } = await import("./routers/shop");
    const body = Buffer.from(JSON.stringify({ event: "payment.succeeded", data: { id: "mnr_1", metadata: { paymentId: paid.id } } }));
    expect(verifyMonerooSignature(body, "abc")).toBe(false); // pas de secret configuré
    process.env.MONEROO_WEBHOOK_SECRET = "whsec_test";
    const signature = (await import("node:crypto")).createHmac("sha512", "whsec_test").update(body).digest("hex");
    expect(verifyMonerooSignature(body, signature)).toBe(true);
    expect(verifyMonerooSignature(Buffer.from("tampered"), signature)).toBe(false);
    delete process.env.MONEROO_WEBHOOK_SECRET;
  });

  it("applique la logique de choix de la boutique qui livre (5.3)", async () => {
    const { pickSourceStore } = await import("./domain/shop");
    const stores = [
      { id: 1, city: "Lomé" },
      { id: 2, city: "Douala" },
      { id: 3, city: "Lomé" },
    ];
    // Priorité à la même ville, puis au plus grand stock.
    expect(pickSourceStore("Lomé", stores, new Map([[1, 5], [2, 9], [3, 3]]), 2)).toBe(1);
    expect(pickSourceStore("Lomé", stores, new Map([[1, 1], [2, 9], [3, 3]]), 2)).toBe(3);
    // Hors ville (international) : plus grand stock.
    expect(pickSourceStore("Paris (DHL)", stores, new Map([[1, 1], [2, 9], [3, 3]]), 1)).toBe(2);
    // Rupture partout : fabrication.
    expect(pickSourceStore("Lomé", stores, new Map([[1, 1], [2, 1], [3, 1]]), 2)).toBeNull();
  });
});

async function stockOf(variantId: number): Promise<number> {
  const db = await getDb();
  const rows = await db!
    .select({ quantity: inventory.quantity })
    .from(inventory)
    .innerJoin((await import("../drizzle/schema")).stores, eq(inventory.storeId, (await import("../drizzle/schema")).stores.id))
    .where(and(eq(inventory.variantId, variantId), eq((await import("../drizzle/schema")).stores.kind, "boutique")));
  return rows.reduce((sum, row) => sum + row.quantity, 0);
}

async function productionCount(): Promise<number> {
  const db = await getDb();
  const rows = await db!.select({ id: productionOrders.id }).from(productionOrders);
  return rows.length;
}

// Référence aux zones pour les types (évite un import inutilisé côté TS strict).
void deliveryZones;
