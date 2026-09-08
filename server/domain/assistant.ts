/**
 * Assistant Commercial & Marketing IA (point 6 de la présentation).
 *
 * Trois modes de fonctionnement :
 *  - `brouillon`      : l'assistant prépare textes et réponses, l'humain valide tout ;
 *  - `semi_autonome`  : il répond seul aux messages clients simples, les publications
 *                       restent à valider ;
 *  - `autonome`       : il publie les publications approuvées et répond seul, avec
 *                       journal d'activité complet.
 *
 * La génération repose sur des gabarits nourris par les données réelles de la
 * marque (produits, gammes, prix, zones de livraison, code parrainage). Si une
 * clé `OPENAI_API_KEY` est configurée, le texte est rehaussé par un LLM — en
 * cas d'échec ou d'absence de clé, le gabarit est utilisé tel quel : l'assistant
 * fonctionne donc toujours, même hors ligne.
 */

export type AssistantMode = "brouillon" | "semi_autonome" | "autonome";
export type AssistantChannel = "whatsapp" | "facebook" | "instagram";
export type PostKind = "produit" | "promo" | "nouvelle_collection" | "reactivation";

export const ASSISTANT_MODES: Array<{ value: AssistantMode; label: string; description: string }> = [
  { value: "brouillon", label: "Brouillon", description: "L'assistant prépare tout, vous validez chaque publication et chaque réponse." },
  { value: "semi_autonome", label: "Semi-autonome", description: "Réponses automatiques aux questions simples ; publications à valider." },
  { value: "autonome", label: "Autonome", description: "Publication et réponses automatiques — chaque action est journalisée." },
];

export const CHANNEL_LABELS: Record<AssistantChannel, string> = {
  whatsapp: "WhatsApp",
  facebook: "Facebook",
  instagram: "Instagram",
};

export const KIND_LABELS: Record<PostKind, string> = {
  produit: "Mise en avant produit",
  promo: "Promotion / code parrainage",
  nouvelle_collection: "Nouvelle collection",
  reactivation: "Relance des anciens clients",
};

/** Données minimales d'un produit pour nourrir les gabarits. */
export type ProductSnapshot = {
  id: number;
  name: string;
  category: string | null;
  gamme: string | null;
  genre: string | null;
  price: number; // devise de la marque
  currency: string;
  onlineAvailable: number;
  colors: string[];
  sizes: string[];
};

export type BrandSnapshot = {
  name: string;
  shopUrl: string | null;
  referralCustomerRate: number; // %
  deliverySummary: string; // ex. « Lomé 1 000 F sous 24 h · Dakar 5 000 F sous 4 jours »
};

const GAMME_WORDS: Record<string, string> = {
  leader: "essentielle",
  vip: "chic",
  royale: "prestige",
  presidentiel: "d'exception",
};

function priceLabel(price: number, currency: string): string {
  const n = Number.isInteger(price) ? price.toLocaleString("fr-FR") : price.toFixed(2).replace(".", ",");
  return `${n} ${currency}`;
}

function sizesPhrase(sizes: string[]): string {
  if (!sizes.length) return "";
  if (sizes.length === 1) return ` Taille ${sizes[0]}.`;
  return ` Tailles ${sizes.slice(0, 6).join(" au ")}.`;
}

function colorsPhrase(colors: string[]): string {
  if (!colors.length) return "";
  return ` Disponible en ${colors.slice(0, 4).join(", ")}.`;
}

function availabilityPhrase(product: ProductSnapshot): string {
  if (product.onlineAvailable > 0) return "Disponible immédiatement en boutique.";
  return "Fabriqué à la demande dans notre atelier — sur mesure bienvenu.";
}

/** Publication « mise en avant produit » adaptée au canal. */
export function buildProductPost(product: ProductSnapshot, brand: BrandSnapshot, channel: AssistantChannel): { title: string; content: string } {
  const gamme = GAMME_WORDS[product.gamme ?? ""] ?? "signature";
  const title = `${product.name} — pièce ${gamme}`;
  const base = [
    `✨ ${product.name}${product.category ? `, ${product.category.toLowerCase()}` : ""} — notre collection ${gamme}.`,
    `${availabilityPhrase(product)}${colorsPhrase(product.colors)}${sizesPhrase(product.sizes)}`,
    `💰 ${priceLabel(product.price, product.currency)}`,
  ];
  if (channel === "whatsapp") {
    const content = [
      ...base,
      brand.deliverySummary ? `🚚 Livraison : ${brand.deliverySummary}` : "🚚 Livraison rapide dans toute la ville.",
      "📲 Répondez à ce message pour réserver le vôtre !",
    ].join("\n");
    return { title, content };
  }
  if (channel === "facebook") {
    const content = [
      ...base,
      product.genre ? `Pour ${product.genre === "femme" ? "elle" : product.genre === "homme" ? "lui" : "toute la famille"} — coupes soignées, finitions main.` : "Coupes soignées, finitions main.",
      brand.shopUrl ? `🛍️ Commandez en ligne : ${brand.shopUrl}` : "🛍️ Passez en boutique ou envoyez-nous un message.",
      brand.deliverySummary ? `Livraison : ${brand.deliverySummary}.` : "",
    ].filter(Boolean).join("\n");
    return { title, content: `${content}\n#ModeAfricaine #Wax #${brand.name.replace(/\s+/g, "")}` };
  }
  // instagram
  const content = [
    `✨ ${product.name}${product.category ? ` · ${product.category}` : ""} ✨`,
    `Collection ${gamme} — ${priceLabel(product.price, product.currency)}`,
    product.onlineAvailable > 0 ? "En stock, prête à livrer." : "Sur mesure, fabriqué avec amour dans notre atelier.",
    brand.shopUrl ? `Commande en ligne 👉 lien en bio (${brand.shopUrl})` : "Commande en DM 👉",
    `#modeafricaine #wax #${(product.category ?? "couture").toLowerCase().replace(/\s+/g, "")} #${brand.name.replace(/\s+/g, "").toLowerCase()} #faitmain #surmesure`,
  ].join("\n");
  return { title, content };
}

/** Publication « promotion » appuyée sur le parrainage de la marque (5.5). */
export function buildPromoPost(brand: BrandSnapshot, channel: AssistantChannel, code?: string | null): { title: string; content: string } {
  const rate = Math.round(brand.referralCustomerRate);
  const promoCode = code ?? `${brand.name.replace(/\s+/g, "").toUpperCase().slice(0, 10)}10`;
  const title = `−${rate} % avec le code ${promoCode}`;
  if (channel === "whatsapp") {
    return {
      title,
      content: [
        `🎉 SPÉCIAL ${brand.name} 🎉`,
        `Grâce à notre parrainage, votre code ${promoCode} vous offre −${rate} % sur vos articles.`,
        brand.deliverySummary ? `🚚 ${brand.deliverySummary}` : "",
        "📲 Répondez « CODE » pour en profiter dès aujourd'hui !",
      ].filter(Boolean).join("\n"),
    };
  }
  if (channel === "facebook") {
    return {
      title,
      content: [
        `🎉 Offre de saison chez ${brand.name} : −${rate} % sur vos articles avec le code ${promoCode}.`,
        "Parrainez vos proches : eux aussi profitent de la réduction, et vous recevez une commission sur chaque vente parrainée.",
        brand.shopUrl ? `🛍️ ${brand.shopUrl}` : "",
        brand.deliverySummary ? `Livraison : ${brand.deliverySummary}.` : "",
      ].filter(Boolean).join("\n#Promo #"),
    };
  }
  return {
    title,
    content: [
      `−${rate} % avec le code ${promoCode} ✨`,
      `${brand.name} — parrainage gagnant-gagnant 🤝`,
      brand.shopUrl ? `Lien en bio 👉 ${brand.shopUrl}` : "",
      `#promo #modeafricaine #${brand.name.replace(/\s+/g, "").toLowerCase()}`,
    ].filter(Boolean).join("\n"),
  };
}

/** Publication « nouvelle collection » / « relance ». */
export function buildThemePost(brand: BrandSnapshot, channel: AssistantChannel, kind: "nouvelle_collection" | "reactivation", productNames: string[]): { title: string; content: string } {
  if (kind === "nouvelle_collection") {
    const list = productNames.slice(0, 3).join(", ");
    const title = "Nouvelle collection disponible";
    const body = [
      `🌟 ${brand.name} dévoile ses nouveautés : ${list}${productNames.length > 3 ? "…" : "."}`,
      "Coupes classiques et pièces d'exception, confectionnées dans notre atelier.",
      brand.shopUrl ? `🛍️ Découvrez la collection : ${brand.shopUrl}` : "🛍️ Disponible dès maintenant en boutique.",
      brand.deliverySummary ? `Livraison : ${brand.deliverySummary}` : "",
    ].filter(Boolean).join("\n");
    return { title, content: channel === "instagram" ? `${body}\n#nouvellecollection #modeafricaine` : body };
  }
  const title = "On vous a gardé des surprises";
  const body = [
    `Ça fait longtemps ! ${brand.name} a plein de nouveautés pour vous 🧵`,
    productNames.length ? `En ce moment en vitrine : ${productNames.slice(0, 3).join(", ")}.` : "",
    `Vos mensurations sont déjà enregistrées : commandez sur mesure en un message.`,
    brand.shopUrl ? `🛍️ ${brand.shopUrl}` : "",
  ].filter(Boolean).join("\n");
  return { title, content: body };
}

/**
 * Suggère une réponse à un message client (mots-clés français courants).
 * `context` contient les infos à mobiliser : prix, zones de livraison, lien.
 */
export function suggestReply(
  message: string,
  context: {
    brandName: string;
    shopUrl: string | null;
    deliverySummary: string;
    referralCustomerRate: number;
    featured: ProductSnapshot | null;
  },
): string {
  const m = message.toLowerCase();
  const withPrix = context.featured ? `${context.featured.name} est à ${priceLabel(context.featured.price, context.featured.currency)}` : null;
  // La livraison d'abord : « combien de temps » parle de délai, pas de prix.
  if (/(livraison|livrer|livre|recevoir|d[ée]lai|exp[ée]dition|temps)/.test(m)) {
    return [
      `Bonjour 👋 Nous livrons partout :`,
      context.deliverySummary,
      "Le paiement se fait à la commande (mobile money ou carte) et vous suivez votre commande avec son numéro WEB.",
    ].join("\n");
  }
  if (/(prix|co[ûu]te|combien|tarif)/.test(m)) {
    return [
      `Bonjour 👋 Merci pour votre message !`,
      withPrix ? `${withPrix}. Nos autres modèles vont de la collection essentielle aux pièces d'exception — dites-moi ce qui vous plaît.` : "Dites-moi quel modèle vous intéresse et je vous communique son prix tout de suite.",
      context.shopUrl ? `Le catalogue complet est ici : ${context.shopUrl}` : "",
    ].filter(Boolean).join("\n");
  }
  if (/(dispo|stock|taille|couleur)/.test(m)) {
    return [
      `Bonjour 👋`,
      context.featured
        ? context.featured.onlineAvailable > 0
          ? `Oui, ${context.featured.name} est disponible${colorsPhrase(context.featured.colors)}${sizesPhrase(context.featured.sizes)}`
          : `${context.featured.name} est confectionné à la demande dans notre atelier (sur mesure possible, délai habituel de l'atelier).`
        : "Je vérifie le stock et je reviens vers vous dans quelques minutes.",
      "Je peux vous réserver la pièce dès votre confirmation 🙂",
    ].join("\n");
  }
  if (/(mesure|mensuration|poitrine|taille \d|hanches)/.test(m)) {
    return [
      `Avec plaisir ! Le sur mesure est notre spécialité ✂️`,
      "Envoyez-moi vos mensurations (poitrine, taille, hanches, longueur) et nos coupeurs confectionnent votre pièce.",
      context.shopUrl ? `Vous pouvez aussi commander directement : ${context.shopUrl}` : "",
    ].filter(Boolean).join("\n");
  }
  if (/(command|acheter|r[ée]server|je veux|je prends)/.test(m)) {
    return [
      `Super choix 😍`,
      `Pour réserver : indiquez-moi le modèle, la taille/la couleur et votre zone de livraison.`,
      context.shopUrl ? `Commande directe : ${context.shopUrl}` : "",
      `Avec le parrainage, vous pouvez bénéficier de −${Math.round(context.referralCustomerRate)} % sur vos articles !`,
    ].filter(Boolean).join("\n");
  }
  if (/(merci|super|parfait|top)/.test(m)) {
    return `Avec grand plaisir 🙏 À très vite chez ${context.brandName} !`;
  }
  return [
    `Bonjour et merci pour votre message 😊`,
    `Je vous réponds dans quelques instants. En attendant, notre catalogue est ici : ${context.shopUrl ?? "en boutique"}.`,
  ].join("\n");
}

/**
 * Rehausse un texte avec un LLM si `OPENAI_API_KEY` est configurée.
 * En cas d'échec (pas de clé, réseau, quota), renvoie le gabarit inchangé.
 */
export async function enhanceWithLLM(instruction: string, draft: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return draft;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        messages: [
          { role: "system", content: "Tu es un assistant marketing pour une maison de couture africaine. Réponds en français, ton chaleureux et professionnel." },
          { role: "user", content: `${instruction}\n\nTexte de base à améliorer (garde la structure et les informations) :\n${draft}` },
        ],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });
    clearTimeout(timer);
    if (!res.ok) return draft;
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content?.trim();
    return text && text.length > 20 ? text : draft;
  } catch {
    return draft;
  }
}

/** Le mode autorise-t-il les réponses automatiques aux messages simples ? */
export function autoReplyEnabled(mode: string): boolean {
  return mode === "semi_autonome" || mode === "autonome";
}

/** Le mode autorise-t-il la publication automatique des posts approuvés ? */
export function autoPublishEnabled(mode: string): boolean {
  return mode === "autonome";
}

/** Message simple = question courte qu'une réponse automatique peut traiter sans risque. */
export function isSimpleCustomerMessage(message: string): boolean {
  return message.trim().length > 0 && message.length <= 300;
}
