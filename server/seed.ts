/**
 * Données de démonstration : la marque test DISTINCTION (section 16 de la
 * présentation) + le compte d'administration ENVOL. Exécuté automatiquement
 * au premier démarrage si la base est vide, ou manuellement via `pnpm db:seed`.
 *
 * Comptes de démonstration (mot de passe indiqué après le /) :
 *  - admin@envol.africa / envol2026        → administration ENVOL
 *  - proprietaire@distinction.tg / demo2026 → propriétaire DISTINCTION
 *  - comptable@distinction.tg / demo2026
 *  - chef.atelier@distinction.tg / demo2026
 *  - vendeuse@distinction.tg / demo2026
 */
import { sql } from "drizzle-orm";
import { hashPassword } from "./_core/auth";
import { getDb } from "./db";
import {
  customers,
  deliveryZones,
  employees,
  exchangeRates,
  inventory,
  organizationMembers,
  organizations,
  orders,
  productionOrders,
  productionTasks,
  productVariants,
  products,
  referrals,
  saleItems,
  salePayments,
  sales,
  stores,
  taskRates,
  treasuryAccounts,
  treasuryMovements,
  users,
} from "../drizzle/schema";
import { DEFAULT_RATES } from "./domain/money";
import { trialEndsFrom } from "./domain/subscription";

const DEMO_PASSWORD = "demo2026";

const GAMMES = [
  { key: "leader", label: "Leader" },
  { key: "vip", label: "VIP" },
  { key: "royale", label: "Royale" },
  { key: "presidentiel", label: "Présidentiel" },
] as const;

/** Grille tarifaire de la marque test (7.4). */
const PRICE_GRID: Record<string, [number, number, number, number]> = {
  Goodluck: [120_000, 200_000, 350_000, 500_000],
  Danshiki: [150_000, 350_000, 500_000, 700_000],
  Agbada: [300_000, 500_000, 700_000, 900_000],
  Abacost: [250_000, 400_000, 600_000, 900_000],
  Robe: [100_000, 200_000, 350_000, 600_000],
  Boubou: [100_000, 200_000, 350_000, 500_000],
};

const ADULT_SIZES = ["S", "M", "MK", "L", "XL", "2XL", "3XL"];
const KID_SIZES = ["S", "M", "L", "XL"];

const TASK_BAREME: Array<[string, number, number | null]> = [
  ["Chapeau", 1_000, 1_000],
  ["Agbada", 5_000, 6_000],
  ["Haut Goodluck", 1_600, 3_000],
  ["Haut Danshiki", 2_000, 4_000],
  ["Pantalon droit", 2_000, null],
  ["Pantalon simple", 1_000, null],
  ["Robe", 3_000, 3_000],
  ["Boubou", 3_000, 3_000],
];

export async function seed(): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Base indisponible pour la seed");

  // Comptes de base
  const passwordHash = hashPassword(DEMO_PASSWORD);
  const [envolAdmin] = await db
    .insert(users)
    .values({ openId: "local:admin@envol.africa", email: "admin@envol.africa", name: "Équipe ENVOL", passwordHash: hashPassword("envol2026"), role: "admin" })
    .returning({ id: users.id });

  const userSeeds = [
    { openId: "local:proprietaire@distinction.tg", email: "proprietaire@distinction.tg", name: "Kossi Amégan (Propriétaire)" },
    { openId: "local:comptable@distinction.tg", email: "comptable@distinction.tg", name: "Ama Tetteh (Comptable)" },
    { openId: "local:chef.atelier@distinction.tg", email: "chef.atelier@distinction.tg", name: "Kofi Adjei (Chef d’atelier)" },
    { openId: "local:vendeuse@distinction.tg", email: "vendeuse@distinction.tg", name: "Aminata Diop (Vendeuse)" },
  ];
  const insertedUsers = await db
    .insert(users)
    .values(userSeeds.map((u) => ({ ...u, passwordHash, lastSignedIn: new Date() })))
    .returning({ id: users.id, email: users.email });
  const userId = (email: string) => insertedUsers.find((u) => u.email === email)!.id;

  // Marque DISTINCTION (formule complète, essai 30 jours)
  const [distinction] = await db
    .insert(organizations)
    .values({
      name: "DISTINCTION",
      slug: "distinction",
      country: "Togo",
      sector: "Couture & mode africaine",
      currency: "XOF",
      plan: "complet",
      status: "trial",
      trialEndsAt: trialEndsFrom(new Date()),
      shopUrl: "https://distinction.ateliermanager.africa",
    })
    .returning({ id: organizations.id });
  const orgId = distinction.id;

  await db.insert(organizationMembers).values([
    { organizationId: orgId, userId: userId("proprietaire@distinction.tg"), role: "owner" },
    { organizationId: orgId, userId: userId("comptable@distinction.tg"), role: "manager" },
    { organizationId: orgId, userId: userId("chef.atelier@distinction.tg"), role: "manager" },
    { organizationId: orgId, userId: userId("vendeuse@distinction.tg"), role: "staff" },
  ]);

  // Taux de change par défaut
  await db
    .insert(exchangeRates)
    .values(Object.entries(DEFAULT_RATES).map(([code, rate]) => ({ code, rateToXof: String(rate) })))
    .onConflictDoNothing();

  // Établissements (16) : un atelier à Lomé, 3 boutiques Lomé (XOF), 2 Douala (XAF)
  const storeRows = await db
    .insert(stores)
    .values([
      { organizationId: orgId, name: "Atelier Kodjoviakopé", kind: "atelier", city: "Lomé", address: "Kodjoviakopé, Lomé, Togo", currency: "XOF" as const },
      { organizationId: orgId, name: "Boutique Nyékonakpoè", kind: "boutique", city: "Lomé", address: "Nyékonakpoè, Lomé", currency: "XOF" as const },
      { organizationId: orgId, name: "Boutique Hôtel 2 Février", kind: "boutique", city: "Lomé", address: "Bd du 13 Janvier, Lomé", currency: "XOF" as const },
      { organizationId: orgId, name: "Boutique Agoè Minamadou", kind: "boutique", city: "Lomé", address: "Agoè Minamadou, Lomé", currency: "XOF" as const },
      { organizationId: orgId, name: "Boutique Bonamoussadi", kind: "boutique", city: "Douala", address: "Bonamoussadi, Douala, Cameroun", currency: "XAF" as const },
      { organizationId: orgId, name: "Boutique Bonapriso", kind: "boutique", city: "Douala", address: "Bonapriso, Douala, Cameroun", currency: "XAF" as const },
    ])
    .returning({ id: stores.id, name: stores.name, kind: stores.kind, currency: stores.currency });
  const atelier = storeRows[0];
  const boutiques = storeRows.slice(1);

  // Trésorerie : caisses boutiques (auto), caisse centrale, banque, mobile money, TPE, boutique en ligne
  await db.insert(treasuryAccounts).values([
    { organizationId: orgId, type: "caisse_centrale", label: "Caisse centrale", currency: "XOF", openingBalance: "500000" },
    { organizationId: orgId, type: "banque", label: "Compte bancaire (Ecobank Togo)", currency: "XOF", openingBalance: "3500000" },
    { organizationId: orgId, type: "mobile_money", label: "Mobile Money (Flooz / MTN)", currency: "XOF", openingBalance: "250000" },
    { organizationId: orgId, type: "tpe", label: "Terminal TPE", currency: "XOF", openingBalance: "0" },
    { organizationId: orgId, type: "boutique_en_ligne", label: "Boutique en ligne (Moneroo)", currency: "XOF", openingBalance: "0" },
    ...storeRows.map((s) => ({
      organizationId: orgId,
      type: s.kind === "atelier" ? ("petite_caisse" as const) : ("caisse_boutique" as const),
      storeId: s.id,
      label: s.kind === "atelier" ? `Petite caisse — ${s.name}` : `Caisse — ${s.name}`,
      currency: s.currency,
      openingBalance: s.kind === "atelier" ? "20000" : "50000",
    })),
  ]);

  // Zones de livraison (5.4) : tarifs fixes par zone, DHL pour l'international.
  await db
    .insert(deliveryZones)
    .values([
      { organizationId: orgId, name: "Lomé", kind: "locale", fee: "1000", currency: "XOF", etaDays: 1 },
      { organizationId: orgId, name: "Reste du Togo", kind: "locale", fee: "3000", currency: "XOF", etaDays: 3 },
      { organizationId: orgId, name: "Douala", kind: "locale", fee: "2000", currency: "XOF", etaDays: 2 },
      { organizationId: orgId, name: "Dakar", kind: "locale", fee: "5000", currency: "XOF", etaDays: 4 },
      { organizationId: orgId, name: "International (DHL)", kind: "internationale", fee: "25000", currency: "XOF", etaDays: 7 },
    ])
    .onConflictDoNothing();

  // Barème de paye à la tâche (8)
  await db.insert(taskRates).values(
    TASK_BAREME.flatMap(([task, rate, embroideryRate]) => {
      const rows = [{ organizationId: orgId, task, withEmbroidery: false, rate: String(rate) }];
      if (embroideryRate !== null) rows.push({ organizationId: orgId, task, withEmbroidery: true, rate: String(embroideryRate) });
      return rows;
    }),
  );

  // Personnel (16) — effectifs réduits mais représentatifs
  const employeeRows: Array<typeof employees.$inferInsert> = [
    { organizationId: orgId, userId: userId("chef.atelier@distinction.tg"), storeId: atelier.id, firstName: "Kofi", lastName: "Adjei", type: "atelier", jobTitle: "chef_atelier", baseSalaryMonthly: "150000" },
    { organizationId: orgId, userId: userId("comptable@distinction.tg"), storeId: null, firstName: "Ama", lastName: "Tetteh", type: "administration", jobTitle: "comptable", baseSalaryMonthly: "200000" },
    { organizationId: orgId, userId: userId("vendeuse@distinction.tg"), storeId: boutiques[0].id, firstName: "Aminata", lastName: "Diop", type: "boutique", jobTitle: "vendeuse", baseSalaryMonthly: "90000" },
    { organizationId: orgId, storeId: atelier.id, firstName: "Eyadéma", lastName: "Tchala", type: "atelier", jobTitle: "coupeur", baseSalaryMonthly: "0" },
    { organizationId: orgId, storeId: atelier.id, firstName: "Messan", lastName: "Gbikpi", type: "atelier", jobTitle: "coupeur", baseSalaryMonthly: "0" },
    { organizationId: orgId, storeId: atelier.id, firstName: "Sena", lastName: "Dossou", type: "atelier", jobTitle: "magasinier", baseSalaryMonthly: "80000" },
  ];
  for (let i = 1; i <= 4; i++) {
    employeeRows.push({ organizationId: orgId, storeId: atelier.id, firstName: `Couturier${i}`, lastName: `Atelier`, type: "atelier", jobTitle: "couturier", baseSalaryMonthly: "0" });
  }
  for (let i = 1; i <= 3; i++) {
    employeeRows.push({ organizationId: orgId, storeId: atelier.id, firstName: `Brodeur${i}`, lastName: `Atelier`, type: "atelier", jobTitle: "brodeur", baseSalaryMonthly: "0" });
  }
  for (const boutique of boutiques) {
    employeeRows.push({ organizationId: orgId, storeId: boutique.id, firstName: "Chef", lastName: boutique.name.replace("Boutique ", ""), type: "boutique", jobTitle: "chef_agence", baseSalaryMonthly: "120000" });
    employeeRows.push({ organizationId: orgId, storeId: boutique.id, firstName: "Vendeuse", lastName: boutique.name.replace("Boutique ", ""), type: "boutique", jobTitle: "vendeuse", baseSalaryMonthly: "80000" });
  }
  const insertedEmployees = await db.insert(employees).values(employeeRows).returning({ id: employees.id, jobTitle: employees.jobTitle });
  const employeeByTitle = (title: string, index = 0) => insertedEmployees.filter((e) => e.jobTitle === title)[index]?.id ?? null;

  // Catalogue (7.4) : 6 modèles × 4 gammes + versions enfant + accessoires
  type ProductInsert = typeof products.$inferInsert;
  const productRows: ProductInsert[] = [];
  for (const [model, prices] of Object.entries(PRICE_GRID)) {
    for (const gamme of GAMMES) {
      productRows.push({
        organizationId: orgId,
        name: `${model} ${gamme.label}`,
        family: "vetement",
        category: model,
        genre: model === "Robe" ? "femme" : "homme",
        gamme: gamme.key,
        sizes: ADULT_SIZES.join(",") + ",Sur mesure",
        basePrice: String(prices[GAMMES.indexOf(gamme)]),
        description: `${model} gamme ${gamme.label} — confection DISTINCTION.`,
      });
    }
    productRows.push({
      organizationId: orgId,
      name: `${model} Enfant`,
      family: "vetement",
      category: model,
      genre: "enfant",
      gamme: "leader",
      sizes: KID_SIZES.join(","),
      basePrice: String(prices[0] / 2),
      description: `${model} enfant — moitié du prix adulte.`,
    });
  }
  const accessories: Array<[string, number]> = [
    ["Sac Wax", 15_000],
    ["Montre classique", 25_000],
    ["Lunettes de soleil", 8_000],
    ["Chaussettes (lot de 3)", 3_000],
    ["Manchettes brodées", 5_000],
  ];
  for (const [name, price] of accessories) {
    productRows.push({ organizationId: orgId, name, family: "accessoire", category: "Accessoire", genre: "homme", gamme: "leader", basePrice: String(price), description: "Accessoire de mode DISTINCTION." });
  }
  const insertedProducts = await db.insert(products).values(productRows).returning({ id: products.id, name: products.name, basePrice: products.basePrice, family: products.family });

  type VariantInsert = typeof productVariants.$inferInsert;
  const variantRows: VariantInsert[] = [];
  for (const product of insertedProducts) {
    const isKid = product.name.includes("Enfant");
    const sizes = product.family === "accessoire" ? ["Taille unique"] : isKid ? KID_SIZES : ADULT_SIZES;
    const prefix = product.name.split(" ")[0].toUpperCase().slice(0, 4);
    for (const size of sizes) {
      variantRows.push({
        productId: product.id,
        sku: `${prefix}-${product.id}-${size.replace(/\s/g, "")}`.slice(0, 64),
        size,
        color: "Noir",
        price: product.basePrice,
      });
    }
  }
  const insertedVariants = await db.insert(productVariants).values(variantRows).returning({ id: productVariants.id });

  // Stock réparti sur les boutiques
  const Quantities = (index: number) => (index % 7 === 0 ? 0 : ((index * 3) % 6) + (index % 3));
  for (const [storeIndex, store] of boutiques.entries()) {
    await db.insert(inventory).values(
      insertedVariants.map((variant, index) => ({
        organizationId: orgId,
        storeId: store.id,
        variantId: variant.id,
        quantity: storeIndex < 3 ? Quantities(index + storeIndex) : Math.max(Quantities(index) - 2, 0),
        reorderLevel: 3,
      })),
    );
  }

  // Clients de démonstration + un code de parrainage
  const insertedCustomers = await db
    .insert(customers)
    .values([
      { organizationId: orgId, firstName: "Aminata", lastName: "Diop", phone: "+228 90 11 22 33", city: "Lomé", measurements: "Poitrine 92, taille 74, hanches 98", notes: "Cliente fidèle, préfère le wax bleu." },
      { organizationId: orgId, firstName: "Moussa", lastName: "Koné", phone: "+225 07 44 55 66", city: "Lomé", measurements: "Cou 40, poitrine 100, longueur 70" },
      { organizationId: orgId, firstName: "Fatou", lastName: "Ndiaye", phone: "+221 77 66 77 88", city: "Dakar" },
      { organizationId: orgId, firstName: "Yannick", lastName: "Bamba", phone: "+237 6 99 88 77", city: "Douala", measurements: "Poitrine 96, taille 80" },
    ])
    .returning({ id: customers.id, firstName: customers.firstName, lastName: customers.lastName });
  await db.insert(referrals).values({ organizationId: orgId, code: "AMINATA10", ownerCustomerId: insertedCustomers[0].id, ownerName: "Aminata Diop" });

  // Quelques ventes déjà enregistrées (caisse + trésorerie)
  const firstStore = boutiques[0];
  type SamplePayment = { method: "cash" | "mobile_money" | "tpe"; currency: "XOF" | "USD" | "EUR"; amount: string; reference?: string; mobileNumber?: string };
  const sampleSales: Array<{ reference: string; total: string; daysAgo: number; customer: { id: number; firstName: string; lastName: string }; payments: SamplePayment[] }> = [
    { reference: "VTE-0001", total: "120000", daysAgo: 2, customer: insertedCustomers[0], payments: [{ method: "cash" as const, currency: "XOF" as const, amount: "70000" }, { method: "mobile_money" as const, currency: "XOF" as const, amount: "50000", mobileNumber: "+228 90 11 22 33" }] },
    { reference: "VTE-0002", total: "45000", daysAgo: 1, customer: insertedCustomers[2], payments: [{ method: "cash" as const, currency: "XOF" as const, amount: "20000" }, { method: "cash" as const, currency: "USD" as const, amount: "25" }, { method: "cash" as const, currency: "EUR" as const, amount: "15" }] },
    { reference: "VTE-0003", total: "350000", daysAgo: 0, customer: insertedCustomers[1], payments: [{ method: "tpe" as const, currency: "XOF" as const, amount: "150000", reference: "TPE-88123" }, { method: "mobile_money" as const, currency: "XOF" as const, amount: "200000", mobileNumber: "+228 91 00 11 22" }] },
  ];
  for (const [saleIndex, sample] of sampleSales.entries()) {
    const createdAt = new Date();
    createdAt.setDate(createdAt.getDate() - sample.daysAgo);
    const [sale] = await db
      .insert(sales)
      .values({
        organizationId: orgId,
        storeId: firstStore.id,
        customerId: sample.customer.id,
        sellerUserId: userId("vendeuse@distinction.tg"),
        reference: sample.reference,
        totalAmount: sample.total,
        currency: "XOF",
        status: "payee",
        createdAt,
      })
      .returning({ id: sales.id });
    const variant = insertedVariants[saleIndex * 5];
    await db.insert(saleItems).values({ saleId: sale.id, variantId: variant.id, quantity: 1, unitPrice: sample.total });
    await db.insert(salePayments).values(sample.payments.map((p) => ({ saleId: sale.id, ...p, reference: p.reference ?? null, mobileNumber: p.mobileNumber ?? null, createdAt })));
    const cashAccount = (await db.select().from(treasuryAccounts).where(sql`"organizationId" = ${orgId} AND "storeId" = ${firstStore.id} AND type = 'caisse_boutique'`).limit(1))[0];
    if (cashAccount) {
      await db.insert(treasuryMovements).values({
        organizationId: orgId,
        accountId: cashAccount.id,
        direction: "entree",
        amount: sample.total,
        currency: "XOF",
        category: "vente",
        refType: "sale",
        refId: sale.id,
        label: `${sample.reference} · vente boutique`,
        createdByUserId: userId("vendeuse@distinction.tg"),
        createdAt,
      });
    }
  }

  // Commande client + fiche de fabrication avec tâches (démo atelier)
  const [order] = await db
    .insert(orders)
    .values({
      organizationId: orgId,
      storeId: firstStore.id,
      customerId: insertedCustomers[1].id,
      reference: "CMD-0001",
      status: "in_production",
      totalAmount: "500000",
      notes: "Agbada Royale brodée main — livraison vendredi.",
    })
    .returning({ id: orders.id });
  const [fiche] = await db
    .insert(productionOrders)
    .values({
      organizationId: orgId,
      type: "commande",
      orderId: order.id,
      storeId: firstStore.id,
      customerId: insertedCustomers[1].id,
      label: "Commande CMD-0001 — Moussa Koné",
      measurements: "Cou 40, poitrine 100, longueur 70",
      notes: "Broderie main dorée sur col et poignets.",
      dueDate: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
      stage: "couture",
      status: "en_cours",
    })
    .returning({ id: productionOrders.id });
  const cutTask = insertedEmployees.find((e) => e.jobTitle === "coupeur");
  const tailorTask = insertedEmployees.find((e) => e.jobTitle === "couturier");
  const embroidererTask = insertedEmployees.find((e) => e.jobTitle === "brodeur");
  await db.insert(productionTasks).values([
    { organizationId: orgId, productionOrderId: fiche.id, employeeId: cutTask?.id ?? null, task: "Agbada", withEmbroidery: false, rate: "5000", status: "terminee", completedAt: new Date(Date.now() - 86400000) },
    { organizationId: orgId, productionOrderId: fiche.id, employeeId: tailorTask?.id ?? null, task: "Agbada", withEmbroidery: false, rate: "5000", status: "terminee", completedAt: new Date() },
    { organizationId: orgId, productionOrderId: fiche.id, employeeId: embroidererTask?.id ?? null, task: "Agbada", withEmbroidery: true, rate: "6000", status: "assignee" },
  ]);

  void envolAdmin;
  console.log("[Seed] Données de démonstration DISTINCTION créées.");
}

/** Seed automatique uniquement si la base est vide. */
export async function seedIfEmpty(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const [row] = await db.select({ count: sql<number>`COUNT(*)` }).from(users);
  if (Number(row?.count ?? 0) === 0) {
    await seed();
  }
}
