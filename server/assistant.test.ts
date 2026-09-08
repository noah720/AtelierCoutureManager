/**
 * Assistant Commercial & Marketing IA (point 6) — tests sur un PostgreSQL
 * embarqué en mémoire : génération de publications nourries par les vraies
 * données, circuit brouillon → approuvé → publié, mode semi-autonome avec
 * réponses automatiques, suggestions de réponse et réglage du mode.
 */
import { beforeAll, describe, expect, it } from "vitest";

process.env.DATABASE_URL = "pglite://:memory:";
process.env.JWT_SECRET = "test-secret";

import { appRouter } from "./routers";
import { getDb, migrateDatabase } from "./db";
import { seed } from "./seed";
import { aiMessages, aiPosts, organizations } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import type { TrpcContext } from "./_core/context";
import { autoPublishEnabled, autoReplyEnabled, buildProductPost, buildPromoPost, suggestReply, type BrandSnapshot, type ProductSnapshot } from "./domain/assistant";

const caller = appRouter.createCaller({
  user: { id: 2, name: "Propriétaire DISTINCTION", email: "proprietaire@distinction.tg", role: "user" } as TrpcContext["user"],
  req: { protocol: "http", headers: {} } as TrpcContext["req"],
  res: {} as TrpcContext["res"],
});

beforeAll(async () => {
  await migrateDatabase();
  await seed();
});

const product: ProductSnapshot = {
  id: 1,
  name: "Agbada Royale",
  category: "Agbada",
  gamme: "royale",
  genre: "homme",
  price: 125000,
  currency: "XOF",
  onlineAvailable: 3,
  colors: ["Blanc doré", "Bleu nuit"],
  sizes: ["M", "L", "XL"],
};

const brand: BrandSnapshot = {
  name: "DISTINCTION",
  shopUrl: "https://demo.am/boutique/distinction",
  referralCustomerRate: 10,
  deliverySummary: "Lomé 1 000 XOF · 1 j — Dakar 5 000 XOF · 4 j",
};

describe("assistant IA — génération (6)", () => {
  it("construit des publications adaptées à chaque canal avec les vraies données", () => {
    const wa = buildProductPost(product, brand, "whatsapp");
    expect(wa.content).toContain("Agbada Royale");
    expect(wa.content).toMatch(/125\s000 XOF/);
    expect(wa.content).toContain("Lomé 1 000 XOF · 1 j");
    expect(wa.content).toContain("Répondez à ce message");

    const ig = buildProductPost(product, brand, "instagram");
    expect(ig.content).toContain("#modeafricaine");
    expect(ig.content).toContain("#distinction");

    const fb = buildProductPost(product, brand, "facebook");
    expect(fb.content).toContain("https://demo.am/boutique/distinction");

    // Rupture de stock → fabrication à la demande mentionnée
    const outOfStock = buildProductPost({ ...product, onlineAvailable: 0 }, brand, "whatsapp");
    expect(outOfStock.content).toContain("Fabriqué à la demande");
  });

  it("met en avant le code de parrainage avec le taux réel de la marque", () => {
    const post = buildPromoPost(brand, "whatsapp", "AMINATA10");
    expect(post.title).toContain("−10 %");
    expect(post.content).toContain("AMINATA10");
    const otherRate = buildPromoPost({ ...brand, referralCustomerRate: 15 }, "facebook");
    expect(otherRate.title).toContain("−15 %");
  });

  it("suggère une réponse adaptée au message client (prix, livraison, sur mesure)", () => {
    const ctx = { brandName: "DISTINCTION", shopUrl: brand.shopUrl, deliverySummary: brand.deliverySummary, referralCustomerRate: 10, featured: product };
    expect(suggestReply("Bonjour, il coûte combien l'Agbada ?", ctx)).toMatch(/125\s000 XOF/);
    expect(suggestReply("Vous livrez à Dakar ? Quels délais ?", ctx)).toContain("Dakar 5 000 XOF · 4 j");
    // « combien de temps » = délai, pas prix : la livraison prime
    expect(suggestReply("Vous livrez à Douala ? Et il faut combien de temps ?", ctx)).toContain("Dakar 5 000 XOF · 4 j");
    expect(suggestReply("Je voudrais sur mesure, poitrine 96", ctx)).toContain("mensurations");
    expect(suggestReply("Je veux commander une pièce", ctx)).toContain("−10 %");
    expect(suggestReply("Merci beaucoup !", ctx)).toContain("DISTINCTION");
  });

  it("n'active l'automatisation que dans les bons modes", () => {
    expect(autoReplyEnabled("brouillon")).toBe(false);
    expect(autoReplyEnabled("semi_autonome")).toBe(true);
    expect(autoReplyEnabled("autonome")).toBe(true);
    expect(autoPublishEnabled("semi_autonome")).toBe(false);
    expect(autoPublishEnabled("autonome")).toBe(true);
  });
});

describe("assistant IA — circuit complet sur la base (6)", () => {
  it("génère, approuve puis publie une publication nourrie du catalogue réel", async () => {
    const settings = await caller.assistant.settings();
    expect(settings.mode).toBe("brouillon");
    expect(settings.modes.length).toBe(3);

    const post = await caller.assistant.generatePost({ channel: "facebook", kind: "produit" });
    expect(post.status).toBe("brouillon");
    expect(post.content.length).toBeGreaterThan(40);
    expect(post.productId).not.toBeNull();

    const approved = await caller.assistant.approvePost({ id: post.id });
    expect(approved.status).toBe("approuve");

    const published = await caller.assistant.publishNow({ id: post.id });
    expect(published.status).toBe("publie");
    expect(published.publishedAt).not.toBeNull();

    const posts = await caller.assistant.listPosts();
    expect(posts.some((p) => p.id === post.id && p.status === "publie")).toBe(true);
  });

  it("suggère puis envoie une réponse humaine dans le fil du client", async () => {
    const inbox = await caller.assistant.inbox();
    const incoming = inbox.find((m) => m.direction === "entrant" && m.body.toLowerCase().includes("combien"));
    expect(incoming).toBeDefined();

    const { suggestion } = await caller.assistant.suggestReply({ messageId: incoming!.id });
    expect(suggestion).toContain("Bonjour");
    expect(suggestion.length).toBeGreaterThan(30);

    const reply = await caller.assistant.sendReply({ messageId: incoming!.id, body: suggestion });
    expect(reply.direction).toBe("sortant");
    expect(reply.origin).toBe("humain");
  });

  it("en mode semi-autonome, répond automatiquement aux messages en attente mais ne publie pas", async () => {
    await caller.assistant.setMode({ mode: "semi_autonome" });
    // Un brouillon reste en brouillon même après autoRun
    const draft = await caller.assistant.generatePost({ channel: "whatsapp", kind: "promo" });
    const result = await caller.assistant.autoRun({});
    expect(result.mode).toBe("semi_autonome");
    expect(result.actions.some((a) => a.type === "reponse_auto")).toBe(true);
    expect(result.actions.some((a) => a.type === "publication")).toBe(false);

    const inbox = await caller.assistant.inbox();
    const auto = inbox.find((m) => m.direction === "sortant" && m.origin === "auto" && m.customerName === "Fatima Bello");
    expect(auto).toBeDefined();

    const posts = await caller.assistant.listPosts();
    expect(posts.find((p) => p.id === draft.id)?.status).toBe("brouillon");

    // retour au mode brouillon pour l'état de démo
    await caller.assistant.setMode({ mode: "brouillon" });
  });

  it("en mode autonome, publie les publications approuvées", async () => {
    await caller.assistant.setMode({ mode: "autonome" });
    const post = await caller.assistant.generatePost({ channel: "instagram", kind: "nouvelle_collection" });
    await caller.assistant.approvePost({ id: post.id });
    const result = await caller.assistant.autoRun({});
    expect(result.actions.some((a) => a.type === "publication" && a.detail.includes(post.title))).toBe(true);
    const posts = await caller.assistant.listPosts();
    expect(posts.find((p) => p.id === post.id)?.status).toBe("publie");
    await caller.assistant.setMode({ mode: "brouillon" });
  });

  it("l'organisation de démo conserve son mode et le journal existe", async () => {
    const db = (await getDb())!;
    const [org] = await db.select({ mode: organizations.aiMode }).from(organizations).where(eq(organizations.id, 1));
    expect(org.mode).toBe("brouillon");
    const messages = await db.select().from(aiMessages);
    const posts = await db.select().from(aiPosts);
    expect(messages.length).toBeGreaterThanOrEqual(4);
    expect(posts.length).toBeGreaterThanOrEqual(3);
  });
});
