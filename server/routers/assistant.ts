/**
 * Assistant Commercial & Marketing IA (point 6 de la présentation).
 *
 * Toutes les routes sont protégées (back-office). Le mode de fonctionnement
 * (brouillon / semi-autonome / autonome) est un réglage de la marque ; en
 * mode autonome, `autoRun` publie les publications approuvées et répond seul
 * aux messages clients, chaque action étant visible dans le journal.
 */
import { z } from "zod";
import { and, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { requireDb } from "./shared";
import { requireOrganization } from "../guards";
import {
  aiMessages,
  aiPosts,
  deliveryZones,
  organizations,
  productVariants,
  products,
  inventory,
  stores,
} from "../../drizzle/schema";
import {
  ASSISTANT_MODES,
  buildProductPost,
  buildPromoPost,
  buildThemePost,
  enhanceWithLLM,
  isSimpleCustomerMessage,
  suggestReply,
  type AssistantChannel,
  type BrandSnapshot,
  type PostKind,
  type ProductSnapshot,
} from "../domain/assistant";

const channels = z.enum(["whatsapp", "facebook", "instagram"]);
const kinds = z.enum(["produit", "promo", "nouvelle_collection", "reactivation"]);
const modes = z.enum(["brouillon", "semi_autonome", "autonome"]);

async function loadBrandContext(organizationId: number, currency: string, name: string, shopUrl: string | null, referralCustomerRate: number) {
  const db = (await getDb())!;
  const zones = await db
    .select()
    .from(deliveryZones)
    .where(and(eq(deliveryZones.organizationId, organizationId), eq(deliveryZones.isActive, true)))
    .orderBy(deliveryZones.fee);
  const deliverySummary = zones
    .slice(0, 3)
    .map((zone) => `${zone.name} ${Number(zone.fee).toLocaleString("fr-FR")} ${currency} · ${zone.etaDays} j`)
    .join(" — ");
  const brand: BrandSnapshot = { name, shopUrl, referralCustomerRate, deliverySummary };
  return { db, brand };
}

async function loadProducts(organizationId: number): Promise<ProductSnapshot[]> {
  const db = (await getDb())!;
  const productRows = await db
    .select()
    .from(products)
    .where(and(eq(products.organizationId, organizationId), eq(products.isActive, true)))
    .orderBy(products.name);
  if (!productRows.length) return [];
  const variantRows = await db
    .select({ id: productVariants.id, productId: productVariants.productId, size: productVariants.size, color: productVariants.color, price: productVariants.price })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(and(eq(products.organizationId, organizationId), inArray(productVariants.productId, productRows.map((p) => p.id))));
  const stockRows = await db
    .select({ variantId: inventory.variantId, quantity: sql<number>`COALESCE(SUM(${inventory.quantity}), 0)` })
    .from(inventory)
    .innerJoin(stores, eq(inventory.storeId, stores.id))
    .where(and(eq(inventory.organizationId, organizationId), eq(stores.kind, "boutique"), eq(stores.isActive, true)))
    .groupBy(inventory.variantId);
  const availability = new Map(stockRows.map((row) => [row.variantId, Number(row.quantity)]));
  const org = await db.select({ currency: organizations.currency }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  const currency = org[0]?.currency ?? "XOF";
  return productRows.map((product) => {
    const variants = variantRows.filter((variant) => variant.productId === product.id);
    const colors = [...new Set(variants.map((v) => v.color).filter((c): c is string => Boolean(c)))];
    const sizes = [...new Set(variants.map((v) => v.size).filter((s): s is string => Boolean(s)))];
    const price = variants.length ? Number(variants[0].price) : Number(product.basePrice ?? 0);
    const onlineAvailable = variants.reduce((sum, variant) => sum + (availability.get(variant.id) ?? 0), 0);
    return { id: product.id, name: product.name, category: product.category, gamme: product.gamme, genre: product.genre, price, currency, onlineAvailable, colors, sizes };
  });
}

export const assistantRouter = router({
  /** Réglages : mode courant + libellés des modes. */
  settings: protectedProcedure.query(async ({ ctx }) => {
    const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager", "staff"]);
    const db = await requireDb();
    const [org] = await db.select({ aiMode: organizations.aiMode }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
    return { mode: org?.aiMode ?? "brouillon", modes: ASSISTANT_MODES };
  }),

  setMode: protectedProcedure
    .input(z.object({ mode: modes }))
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner"]);
      const db = await requireDb();
      await db.update(organizations).set({ aiMode: input.mode, updatedAt: new Date() }).where(eq(organizations.id, organizationId));
      return { success: true, mode: input.mode } as const;
    }),

  /** Génère une publication à partir des données réelles de la marque. */
  generatePost: protectedProcedure
    .input(z.object({ channel: channels, kind: kinds, productId: z.number().int().positive().optional(), referralCode: z.string().max(40).optional() }))
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager"]);
      const db = await requireDb();
      const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
      if (!org) throw new TRPCError({ code: "NOT_FOUND", message: "Marque introuvable." });
      const { brand } = await loadBrandContext(organizationId, org.currency, org.name, org.shopUrl, Number(org.referralCustomerRate));
      const catalog = await loadProducts(organizationId);

      let built: { title: string; content: string };
      let productId: number | null = null;
      if (input.kind === "produit") {
        const product = catalog.find((p) => p.id === input.productId) ?? catalog.find((p) => p.onlineAvailable > 0) ?? catalog[0];
        if (!product) throw new TRPCError({ code: "BAD_REQUEST", message: "Ajoutez d'abord un produit au catalogue." });
        productId = product.id;
        built = buildProductPost(product, brand, input.channel);
      } else if (input.kind === "promo") {
        built = buildPromoPost(brand, input.channel, input.referralCode);
      } else {
        const names = catalog.slice(0, 4).map((p) => p.name);
        built = buildThemePost(brand, input.channel, input.kind, names);
      }
      const content = await enhanceWithLLM(
        `Améliore cette publication ${input.channel} pour ${org.name} : plus engageante, toujours en français, mêmes informations.`,
        built.content,
      );
      const [post] = await db
        .insert(aiPosts)
        .values({ organizationId, channel: input.channel, kind: input.kind, productId, title: built.title, content })
        .returning();
      return post;
    }),

  /** Catalogue simplifié pour nourrir le générateur de publications. */
  products: protectedProcedure.query(async ({ ctx }) => {
    const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager", "staff"]);
    return loadProducts(organizationId);
  }),

  listPosts: protectedProcedure.query(async ({ ctx }) => {
    const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager", "staff"]);
    const db = await requireDb();
    return db.select().from(aiPosts).where(eq(aiPosts.organizationId, organizationId)).orderBy(desc(aiPosts.createdAt)).limit(60);
  }),

  approvePost: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager"]);
      const db = await requireDb();
      const [post] = await db
        .update(aiPosts)
        .set({ status: "approuve" })
        .where(and(eq(aiPosts.id, input.id), eq(aiPosts.organizationId, organizationId), eq(aiPosts.status, "brouillon")))
        .returning();
      if (!post) throw new TRPCError({ code: "NOT_FOUND", message: "Brouillon introuvable ou déjà traité." });
      return post;
    }),

  rejectPost: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager"]);
      const db = await requireDb();
      const [post] = await db
        .update(aiPosts)
        .set({ status: "rejete" })
        .where(and(eq(aiPosts.id, input.id), eq(aiPosts.organizationId, organizationId), eq(aiPosts.status, "brouillon")))
        .returning();
      if (!post) throw new TRPCError({ code: "NOT_FOUND", message: "Brouillon introuvable ou déjà traité." });
      return post;
    }),

  publishNow: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager"]);
      const db = await requireDb();
      const [post] = await db
        .update(aiPosts)
        .set({ status: "publie", publishedAt: new Date() })
        .where(and(eq(aiPosts.id, input.id), eq(aiPosts.organizationId, organizationId), inArray(aiPosts.status, ["brouillon", "approuve"])))
        .returning();
      if (!post) throw new TRPCError({ code: "NOT_FOUND", message: "Publication introuvable ou déjà publiée." });
      return post;
    }),

  /** Boîte de réception multi-canal : messages + réponses (les plus récents d'abord). */
  inbox: protectedProcedure.query(async ({ ctx }) => {
    const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager", "staff"]);
    const db = await requireDb();
    return db.select().from(aiMessages).where(eq(aiMessages.organizationId, organizationId)).orderBy(desc(aiMessages.createdAt)).limit(120);
  }),

  /** Suggestion de réponse pour un message entrant (basée sur les données de la marque). */
  suggestReply: protectedProcedure
    .input(z.object({ messageId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager", "staff"]);
      const db = await requireDb();
      const [message] = await db
        .select()
        .from(aiMessages)
        .where(and(eq(aiMessages.id, input.messageId), eq(aiMessages.organizationId, organizationId), eq(aiMessages.direction, "entrant")))
        .limit(1);
      if (!message) throw new TRPCError({ code: "NOT_FOUND", message: "Message introuvable." });
      const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
      if (!org) throw new TRPCError({ code: "NOT_FOUND", message: "Marque introuvable." });
      const { brand } = await loadBrandContext(organizationId, org.currency, org.name, org.shopUrl, Number(org.referralCustomerRate));
      const catalog = await loadProducts(organizationId);
      const featured = catalog.find((p) => p.onlineAvailable > 0) ?? catalog[0] ?? null;
      return { suggestion: suggestReply(message.body, { brandName: org.name, shopUrl: org.shopUrl, deliverySummary: brand.deliverySummary, referralCustomerRate: Number(org.referralCustomerRate), featured }) };
    }),

  /** Envoie une réponse (humaine) dans le fil du client. */
  sendReply: protectedProcedure
    .input(z.object({ messageId: z.number().int().positive(), body: z.string().min(1).max(4000) }))
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager", "staff"]);
      const db = await requireDb();
      const [message] = await db
        .select()
        .from(aiMessages)
        .where(and(eq(aiMessages.id, input.messageId), eq(aiMessages.organizationId, organizationId), eq(aiMessages.direction, "entrant")))
        .limit(1);
      if (!message) throw new TRPCError({ code: "NOT_FOUND", message: "Message introuvable." });
      const [reply] = await db
        .insert(aiMessages)
        .values({ organizationId, channel: message.channel, customerName: message.customerName, direction: "sortant", body: input.body, origin: "humain" })
        .returning();
      return reply;
    }),

  /** Insère un message client de démonstration (pour tester l'assistant). */
  demoIncoming: protectedProcedure
    .input(z.object({ channel: channels.default("whatsapp") }))
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager", "staff"]);
      const db = await requireDb();
      const samples = [
        { name: "Aminata Sow", body: "Bonjour, le Sac Wax il coûte combien ?" },
        { name: "Jean-Marc Tchoumi", body: "Est-ce que vous avez la robe en taille L ? Vous livrez à Douala ?" },
        { name: "Fatima Bello", body: "Je voudrais une boubou sur mesure, poitrine 96, longueur 130. C'est possible ?" },
        { name: "Kwame Mensah", body: "Quels sont vos délais de livraison sur Accra ?" },
      ];
      const pick = samples[Math.floor(Math.random() * samples.length)];
      const [message] = await db
        .insert(aiMessages)
        .values({ organizationId, channel: input.channel, customerName: pick.name, direction: "entrant", body: pick.body, origin: "client" })
        .returning();
      return message;
    }),

  /**
   * Exécute le travail automatique autorisé par le mode courant :
   *  - semi_autonome / autonome → réponses automatiques aux messages simples ;
   *  - autonome                 → publication des posts approuvés dus.
   * Renvoie le journal des actions effectuées.
   */
  autoRun: protectedProcedure
    .input(z.object({}).default({}))
    .mutation(async ({ ctx }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager"]);
      const db = await requireDb();
      const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
      if (!org) throw new TRPCError({ code: "NOT_FOUND", message: "Marque introuvable." });
      const mode = org.aiMode;
      const actions: Array<{ type: string; detail: string }> = [];
      if (mode === "brouillon") {
        return { mode, actions, message: "Mode brouillon : aucune action automatique. Changez de mode pour activer l'automatisation." };
      }
      const { brand } = await loadBrandContext(organizationId, org.currency, org.name, org.shopUrl, Number(org.referralCustomerRate));
      const catalog = await loadProducts(organizationId);
      const featured = catalog.find((p) => p.onlineAvailable > 0) ?? catalog[0] ?? null;
      const replyContext = { brandName: org.name, shopUrl: org.shopUrl, deliverySummary: brand.deliverySummary, referralCustomerRate: Number(org.referralCustomerRate), featured };

      // 1. Réponses automatiques aux messages entrants sans réponse.
      const all: Array<typeof aiMessages.$inferSelect> = await db
        .select()
        .from(aiMessages)
        .where(eq(aiMessages.organizationId, organizationId))
        .orderBy(aiMessages.createdAt)
        .limit(300);
      const answered = new Set(all.filter((m) => m.direction === "sortant").map((m) => m.customerName));
      const pending = all.filter((m) => m.direction === "entrant" && !answered.has(m.customerName) && isSimpleCustomerMessage(m.body));
      for (const message of pending.slice(0, 10)) {
        const body = suggestReply(message.body, replyContext);
        await db.insert(aiMessages).values({ organizationId, channel: message.channel, customerName: message.customerName, direction: "sortant", body, origin: "auto" });
        actions.push({ type: "reponse_auto", detail: `${message.customerName} (${message.channel}) — réponse automatique envoyée.` });
      }

      // 2. En mode autonome : publication des posts approuvés (dus ou sans date).
      if (mode === "autonome") {
        const due = await db
          .select()
          .from(aiPosts)
          .where(and(eq(aiPosts.organizationId, organizationId), eq(aiPosts.status, "approuve"), or(isNull(aiPosts.scheduledAt), lte(aiPosts.scheduledAt, new Date()))))
          .limit(5);
        for (const post of due) {
          await db.update(aiPosts).set({ status: "publie", publishedAt: new Date() }).where(eq(aiPosts.id, post.id));
          actions.push({ type: "publication", detail: `${post.channel} — « ${post.title} » publiée.` });
        }
      }
      return { mode, actions, message: actions.length ? `${actions.length} action(s) automatique(s) effectuée(s).` : "Rien à traiter pour le moment." };
    }),
});
