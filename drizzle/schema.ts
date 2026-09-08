import {
  boolean,
  date,
  integer,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Énumérations métier                                                 */
/* ------------------------------------------------------------------ */

export const userRoleEnum = pgEnum("userRole", ["user", "admin"]);
export const memberRoleEnum = pgEnum("memberRole", ["owner", "manager", "staff"]);
export const orgPlanEnum = pgEnum("orgPlan", ["boutique", "atelier_boutique", "complet"]);
export const orgStatusEnum = pgEnum("orgStatus", ["trial", "active", "grace", "blocked", "suspended"]);

export const productFamilyEnum = pgEnum("productFamily", ["vetement", "accessoire"]);
export const productGenreEnum = pgEnum("productGenre", ["femme", "homme", "enfant"]);
export const productGammeEnum = pgEnum("productGamme", ["leader", "vip", "royale", "presidentiel"]);

export const currencyEnum = pgEnum("currency", ["XOF", "XAF", "USD", "EUR"]);
export const paymentMethodEnum = pgEnum("paymentMethod", ["cash", "mobile_money", "tpe", "card", "transfer", "online"]);
export const saleStatusEnum = pgEnum("saleStatus", ["partielle", "payee", "annulee"]);

export const orderStatusEnum = pgEnum("orderStatus", [
  "pending",
  "confirmed",
  "in_production",
  "ready",
  "delivered",
  "cancelled"]);
export const orderChannelEnum = pgEnum("orderChannel", ["boutique", "en_ligne"]);
export const orderPaymentStatusEnum = pgEnum("orderPaymentStatus", ["impaye", "paye", "rembourse"]);
export const zoneKindEnum = pgEnum("zoneKind", ["locale", "internationale"]);
export const onlinePaymentStatusEnum = pgEnum("onlinePaymentStatus", ["en_attente", "succes", "echec"]);

export const productionTypeEnum = pgEnum("productionType", ["commande", "confection", "retouche"]);
export const productionStageEnum = pgEnum("productionStage", [
  "coupe",
  "couture",
  "broderie",
  "finition",
  "controle_qualite",
  "emballage",
  "livraison",
]);
export const productionStatusEnum = pgEnum("productionStatus", ["ouverte", "en_cours", "terminee", "annulee"]);
export const taskStatusEnum = pgEnum("taskStatus", ["assignee", "terminee"]);

export const purchaseStatusEnum = pgEnum("purchaseStatus", [
  "proposee",
  "valide_acheteur",
  "valide_comptable",
  "approubee",
  "commandee",
  "recue",
  "refusee",
]);

export const accountTypeEnum = pgEnum("accountType", [
  "caisse_boutique",
  "caisse_centrale",
  "banque",
  "mobile_money",
  "tpe",
  "boutique_en_ligne",
  "petite_caisse",
]);
export const movementDirectionEnum = pgEnum("movementDirection", ["entree", "sortie"]);
export const movementCategoryEnum = pgEnum("movementCategory", [
  "vente",
  "achat",
  "paie",
  "petite_caisse",
  "abonnement",
  "ajustement",
  "autre",
]);

export const employeeTypeEnum = pgEnum("employeeType", ["boutique", "administration", "atelier"]);
export const bonusTypeEnum = pgEnum("bonusType", [
  "meilleur_semaine",
  "meilleur_mois",
  "gros_achat",
  "fidelite",
  "autre",
]);

export const ticketStatusEnum = pgEnum("ticketStatus", ["ouvert", "en_cours", "resolu", "ferme"]);
export const subscriptionPaymentStatusEnum = pgEnum("subscriptionPaymentStatus", ["en_attente", "valide", "refuse"]);

/* ------------------------------------------------------------------ */
/* Utilisateurs & organisations                                        */
/* ------------------------------------------------------------------ */

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 160 }).notNull().unique(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  passwordHash: text("passwordHash"),
  name: text("name"),
  loginMethod: varchar("loginMethod", { length: 64 }).default("local").notNull(),
  role: userRoleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  slug: varchar("slug", { length: 96 }).notNull().unique(),
  country: varchar("country", { length: 80 }),
  sector: varchar("sector", { length: 120 }),
  currency: currencyEnum("currency").default("XOF").notNull(),
  logoUrl: text("logoUrl"),
  plan: orgPlanEnum("plan").default("boutique").notNull(),
  status: orgStatusEnum("status").default("trial").notNull(),
  trialEndsAt: timestamp("trialEndsAt").notNull(),
  subscriptionEndsAt: timestamp("subscriptionEndsAt"),
  /** Boutique en ligne (formule complète) */
  shopUrl: text("shopUrl"),
  customDomain: text("customDomain"),
  domainVerified: boolean("domainVerified").default(false).notNull(),
  /** Parrainage configurable (taux en %) */
  referralCustomerRate: numeric("referralCustomerRate", { precision: 5, scale: 2 }).default("10").notNull(),
  referralAffiliateRate: numeric("referralAffiliateRate", { precision: 5, scale: 2 }).default("10").notNull(),
  /** Assistant IA (point 6) : brouillon | semi_autonome | autonome */
  aiMode: varchar("aiMode", { length: 20 }).default("brouillon").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const organizationMembers = pgTable(
  "organizationMembers",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organizationId").notNull(),
    userId: integer("userId").notNull(),
    role: memberRoleEnum("role").default("staff").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({ membershipUnique: uniqueIndex("organization_membership_unique").on(table.organizationId, table.userId) }),
);

export const subscriptionPayments = pgTable("subscriptionPayments", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  plan: orgPlanEnum("plan").notNull(),
  months: integer("months").default(1).notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  currency: currencyEnum("currency").default("XOF").notNull(),
  method: varchar("method", { length: 40 }).default("mobile_money").notNull(),
  reference: varchar("reference", { length: 120 }),
  status: subscriptionPaymentStatusEnum("status").default("en_attente").notNull(),
  validatedByUserId: integer("validatedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/* Boutiques, clients, catalogue & stock                               */
/* ------------------------------------------------------------------ */

export const stores = pgTable("stores", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  kind: varchar("kind", { length: 20 }).default("boutique").notNull(), // boutique | atelier
  city: varchar("city", { length: 100 }),
  address: text("address"),
  currency: currencyEnum("currency").default("XOF").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  /** Géolocalisation du point de vente (pointage 14.2) */
  latitude: text("latitude"),
  longitude: text("longitude"),
  /** Rayon de tolérance du pointage en mètres (défaut : 150 m). */
  geofenceRadius: integer("geofenceRadius").default(150).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  firstName: varchar("firstName", { length: 80 }).notNull(),
  lastName: varchar("lastName", { length: 80 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 40 }),
  city: varchar("city", { length: 100 }),
  birthday: date("birthday"),
  photoUrl: text("photoUrl"),
  measurements: text("measurements"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  family: productFamilyEnum("family").default("vetement").notNull(),
  category: varchar("category", { length: 80 }).notNull(),
  genre: productGenreEnum("genre").default("homme").notNull(),
  gamme: productGammeEnum("gamme").default("leader").notNull(),
  sizes: text("sizes"), // ex. "S,M,MK,L,XL,2XL,3XL,Sur mesure"
  description: text("description"),
  basePrice: numeric("basePrice", { precision: 14, scale: 2 }).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const productVariants = pgTable("productVariants", {
  id: serial("id").primaryKey(),
  productId: integer("productId").notNull(),
  sku: varchar("sku", { length: 64 }).notNull().unique(),
  size: varchar("size", { length: 32 }),
  color: varchar("color", { length: 64 }),
  price: numeric("price", { precision: 14, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const inventory = pgTable(
  "inventory",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organizationId").notNull(),
    storeId: integer("storeId").notNull(),
    variantId: integer("variantId").notNull(),
    quantity: integer("quantity").default(0).notNull(),
    reorderLevel: integer("reorderLevel").default(5).notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (table) => ({ inventoryUnique: uniqueIndex("inventory_store_variant_unique").on(table.storeId, table.variantId) }),
);

export const inventoryMovements = pgTable("inventoryMovements", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  storeId: integer("storeId").notNull(),
  variantId: integer("variantId").notNull(),
  delta: integer("delta").notNull(),
  reason: varchar("reason", { length: 60 }).default("ajustement").notNull(),
  note: text("note"),
  createdByUserId: integer("createdByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/* Commandes client (atelier)                                          */
/* ------------------------------------------------------------------ */

export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organizationId").notNull(),
    storeId: integer("storeId").notNull(),
    customerId: integer("customerId").notNull(),
    reference: varchar("reference", { length: 32 }).notNull(),
    status: orderStatusEnum("status").default("pending").notNull(),
    totalAmount: numeric("totalAmount", { precision: 14, scale: 2 }).notNull(),
    notes: text("notes"),
    /** Canal de vente : boutique physique ou commande en ligne (5.3) */
    channel: orderChannelEnum("channel").default("boutique").notNull(),
    paymentStatus: orderPaymentStatusEnum("paymentStatus").default("impaye").notNull(),
    referralCode: varchar("referralCode", { length: 32 }),
    /** Livraison (5.4) */
    deliveryZoneId: integer("deliveryZoneId"),
    deliveryFee: numeric("deliveryFee", { precision: 14, scale: 2 }).default("0").notNull(),
    deliveryName: varchar("deliveryName", { length: 160 }),
    deliveryPhone: varchar("deliveryPhone", { length: 40 }),
    deliveryAddress: text("deliveryAddress"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (table) => ({ referenceUnique: uniqueIndex("orders_organization_reference_unique").on(table.organizationId, table.reference) }),
);

export const orderItems = pgTable("orderItems", {
  id: serial("id").primaryKey(),
  orderId: integer("orderId").notNull(),
  variantId: integer("variantId").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: numeric("unitPrice", { precision: 14, scale: 2 }).notNull(),
});

/* ------------------------------------------------------------------ */
/* Boutique en ligne : zones de livraison & paiements                  */
/* ------------------------------------------------------------------ */

export const deliveryZones = pgTable(
  "deliveryZones",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organizationId").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    /** Locale : tarif fixe de la marque. Internationale : DHL (5.4). */
    kind: zoneKindEnum("kind").default("locale").notNull(),
    fee: numeric("fee", { precision: 14, scale: 2 }).default("0").notNull(),
    currency: currencyEnum("currency").default("XOF").notNull(),
    etaDays: integer("etaDays"),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({ zoneUnique: uniqueIndex("delivery_zones_name_unique").on(table.organizationId, table.name) }),
);

export const onlinePayments = pgTable("onlinePayments", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  orderId: integer("orderId").notNull(),
  provider: varchar("provider", { length: 40 }).default("moneroo").notNull(),
  /** simulation : page de paiement intégrée ; live : caisse Moneroo réelle */
  mode: varchar("mode", { length: 20 }).default("simulation").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  currency: currencyEnum("currency").default("XOF").notNull(),
  status: onlinePaymentStatusEnum("status").default("en_attente").notNull(),
  providerRef: varchar("providerRef", { length: 160 }),
  checkoutUrl: text("checkoutUrl"),
  customerEmail: varchar("customerEmail", { length: 320 }),
  paidAt: timestamp("paidAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/* Ventes en caisse (boutique physique)                                */
/* ------------------------------------------------------------------ */

export const sales = pgTable(
  "sales",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organizationId").notNull(),
    storeId: integer("storeId").notNull(),
    customerId: integer("customerId"),
    sellerUserId: integer("sellerUserId"),
    reference: varchar("reference", { length: 32 }).notNull(),
    totalAmount: numeric("totalAmount", { precision: 14, scale: 2 }).notNull(),
    discountAmount: numeric("discountAmount", { precision: 14, scale: 2 }).default("0").notNull(),
    currency: currencyEnum("currency").default("XOF").notNull(),
    /** Code parrain appliqué (réduction client + commission affilié) */
    referralCode: varchar("referralCode", { length: 32 }),
    /** Remboursement partiel cumulé (point 15) — jamais supérieur au total. */
    refundedAmount: numeric("refundedAmount", { precision: 14, scale: 2 }).default("0").notNull(),
    status: saleStatusEnum("status").default("payee").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({ saleReferenceUnique: uniqueIndex("sales_organization_reference_unique").on(table.organizationId, table.reference) }),
);

export const saleItems = pgTable("saleItems", {
  id: serial("id").primaryKey(),
  saleId: integer("saleId").notNull(),
  variantId: integer("variantId").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: numeric("unitPrice", { precision: 14, scale: 2 }).notNull(),
});

export const salePayments = pgTable("salePayments", {
  id: serial("id").primaryKey(),
  saleId: integer("saleId").notNull(),
  method: paymentMethodEnum("method").notNull(),
  currency: currencyEnum("currency").default("XOF").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  /** Référence TPE ou identifiant transaction mobile money */
  reference: varchar("reference", { length: 120 }),
  /** Numéro mobile sur lequel la demande de paiement a été envoyée */
  mobileNumber: varchar("mobileNumber", { length: 40 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const exchangeRates = pgTable("exchangeRates", {
  code: varchar("code", { length: 3 }).primaryKey(),
  /** Taux vers le franc CFA (XOF) : 1 unité de la devise = N XOF */
  rateToXof: numeric("rateToXof", { precision: 16, scale: 6 }).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

/** Codes de parrainage / affiliation par marque */
export const referrals = pgTable(
  "referrals",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organizationId").notNull(),
    code: varchar("code", { length: 32 }).notNull(),
    ownerCustomerId: integer("ownerCustomerId"),
    ownerName: varchar("ownerName", { length: 160 }),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({ referralUnique: uniqueIndex("referrals_organization_code_unique").on(table.organizationId, table.code) }),
);

/* ------------------------------------------------------------------ */
/* Atelier : fabrication & paye à la tâche                             */
/* ------------------------------------------------------------------ */

export const taskRates = pgTable(
  "taskRates",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organizationId").notNull(),
    task: varchar("task", { length: 120 }).notNull(),
    withEmbroidery: boolean("withEmbroidery").default(false).notNull(),
    rate: numeric("rate", { precision: 14, scale: 2 }).notNull(),
    active: boolean("active").default(true).notNull(),
  },
  (table) => ({ taskRateUnique: uniqueIndex("task_rates_unique").on(table.organizationId, table.task, table.withEmbroidery) }),
);

export const productionOrders = pgTable("productionOrders", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  type: productionTypeEnum("type").default("commande").notNull(),
  orderId: integer("orderId"),
  storeId: integer("storeId"),
  customerId: integer("customerId"),
  label: varchar("label", { length: 200 }).notNull(),
  measurements: text("measurements"),
  notes: text("notes"),
  dueDate: date("dueDate"),
  stage: productionStageEnum("stage").default("coupe").notNull(),
  status: productionStatusEnum("status").default("ouverte").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const productionTasks = pgTable("productionTasks", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  productionOrderId: integer("productionOrderId").notNull(),
  employeeId: integer("employeeId"),
  task: varchar("task", { length: 120 }).notNull(),
  withEmbroidery: boolean("withEmbroidery").default(false).notNull(),
  rate: numeric("rate", { precision: 14, scale: 2 }).default("0").notNull(),
  status: taskStatusEnum("status").default("assignee").notNull(),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/* Achats de fournitures (circuit de validation)                       */
/* ------------------------------------------------------------------ */

export const purchaseRequests = pgTable("purchaseRequests", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  requestedByUserId: integer("requestedByUserId"),
  requesterName: varchar("requesterName", { length: 160 }).notNull(),
  supplier: varchar("supplier", { length: 160 }),
  totalAmount: numeric("totalAmount", { precision: 14, scale: 2 }).notNull(),
  currency: currencyEnum("currency").default("XOF").notNull(),
  status: purchaseStatusEnum("status").default("proposee").notNull(),
  buyerNote: text("buyerNote"),
  accountantNote: text("accountantNote"),
  directorNote: text("directorNote"),
  decidedAt: timestamp("decidedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const purchaseRequestItems = pgTable("purchaseRequestItems", {
  id: serial("id").primaryKey(),
  requestId: integer("requestId").notNull(),
  label: varchar("label", { length: 200 }).notNull(),
  quantity: integer("quantity").default(1).notNull(),
  unitPrice: numeric("unitPrice", { precision: 14, scale: 2 }).notNull(),
});

/* ------------------------------------------------------------------ */
/* Trésorerie                                                          */
/* ------------------------------------------------------------------ */

export const treasuryAccounts = pgTable(
  "treasuryAccounts",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organizationId").notNull(),
    type: accountTypeEnum("type").notNull(),
    storeId: integer("storeId"),
    label: varchar("label", { length: 160 }).notNull(),
    currency: currencyEnum("currency").default("XOF").notNull(),
    openingBalance: numeric("openingBalance", { precision: 14, scale: 2 }).default("0").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({ accountLabelUnique: uniqueIndex("treasury_accounts_label_unique").on(table.organizationId, table.label) }),
);

export const treasuryMovements = pgTable("treasuryMovements", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  accountId: integer("accountId").notNull(),
  direction: movementDirectionEnum("direction").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  currency: currencyEnum("currency").default("XOF").notNull(),
  category: movementCategoryEnum("category").default("autre").notNull(),
  refType: varchar("refType", { length: 40 }),
  refId: integer("refId"),
  label: varchar("label", { length: 240 }).notNull(),
  createdByUserId: integer("createdByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/* Personnel : employés, présence, primes                              */
/* ------------------------------------------------------------------ */

export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  userId: integer("userId"),
  storeId: integer("storeId"),
  firstName: varchar("firstName", { length: 80 }).notNull(),
  lastName: varchar("lastName", { length: 80 }).notNull(),
  type: employeeTypeEnum("type").default("boutique").notNull(),
  jobTitle: varchar("jobTitle", { length: 80 }).notNull(),
  baseSalaryMonthly: numeric("baseSalaryMonthly", { precision: 14, scale: 2 }).default("0").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const attendanceSessions = pgTable("attendanceSessions", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  employeeId: integer("employeeId").notNull(),
  storeId: integer("storeId"),
  checkInAt: timestamp("checkInAt").defaultNow().notNull(),
  checkOutAt: timestamp("checkOutAt"),
  locationOk: boolean("locationOk").default(true).notNull(),
  incident: text("incident"),
  /** Géolocalisation du pointage (point 14.2) */
  checkInLat: text("checkInLat"),
  checkInLng: text("checkInLng"),
  checkOutLat: text("checkOutLat"),
  checkOutLng: text("checkOutLng"),
  /** Minutes travaillées hors créneau horaire (majoration +20 %) */
  outsideMinutes: integer("outsideMinutes").default(0).notNull(),
  /** Clôture automatique après oubli de pointage (> 15 min après la fin) */
  autoClosed: boolean("autoClosed").default(false).notNull(),
});

/** Créneaux horaires hebdomadaires par employé (point 14.2) — 0 = dimanche. */
export const employeeSchedules = pgTable(
  "employeeSchedules",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organizationId").notNull(),
    employeeId: integer("employeeId").notNull(),
    dayOfWeek: integer("dayOfWeek").notNull(), // 0 = dimanche … 6 = samedi
    startTime: varchar("startTime", { length: 5 }).notNull(), // "08:00"
    endTime: varchar("endTime", { length: 5 }).notNull(), // "19:00"
    active: boolean("active").default(true).notNull(),
  },
  (table) => ({ scheduleDayUnique: uniqueIndex("employee_schedules_day_unique").on(table.employeeId, table.dayOfWeek) }),
);

export const bonuses = pgTable(
  "bonuses",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organizationId").notNull(),
    employeeId: integer("employeeId").notNull(),
    type: bonusTypeEnum("type").default("autre").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    note: text("note"),
    /** Clé de période (idempotence du plan de primes) : 2026-W37, 2026-09, 2026-T3, 2026 */
    periodKey: varchar("periodKey", { length: 16 }),
    awardedByUserId: integer("awardedByUserId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    /** Une seule prime planifiée par employé, type et période. */
    bonusPeriodUnique: uniqueIndex("bonuses_period_unique").on(table.organizationId, table.employeeId, table.type, table.periodKey),
  }),
);

/* ------------------------------------------------------------------ */
/* Assistance                                                          */
/* ------------------------------------------------------------------ */

export const supportTickets = pgTable("supportTickets", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId"),
  userId: integer("userId"),
  reporterName: varchar("reporterName", { length: 160 }).notNull(),
  pageUrl: text("pageUrl"),
  subject: varchar("subject", { length: 200 }).notNull(),
  message: text("message").notNull(),
  status: ticketStatusEnum("status").default("ouvert").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const supportTicketMessages = pgTable("supportTicketMessages", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticketId").notNull(),
  authorName: varchar("authorName", { length: 160 }).notNull(),
  authorSide: varchar("authorSide", { length: 20 }).default("client").notNull(), // client | support
  message: text("message").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/* Assistant IA (point 6)                                              */
/* ------------------------------------------------------------------ */

/** Publications marketing générées (WhatsApp / Facebook / Instagram). */
export const aiPosts = pgTable("aiPosts", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  channel: varchar("channel", { length: 20 }).notNull(), // whatsapp | facebook | instagram
  kind: varchar("kind", { length: 28 }).notNull(), // produit | promo | nouvelle_collection | reactivation
  productId: integer("productId"),
  title: varchar("title", { length: 200 }).notNull(),
  content: text("content").notNull(),
  status: varchar("status", { length: 16 }).default("brouillon").notNull(), // brouillon | approuve | publie | rejete
  scheduledAt: timestamp("scheduledAt"),
  publishedAt: timestamp("publishedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** Conversations clients (WhatsApp/Facebook/Instagram) et réponses de l'assistant. */
export const aiMessages = pgTable("aiMessages", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  channel: varchar("channel", { length: 20 }).default("whatsapp").notNull(),
  customerName: varchar("customerName", { length: 160 }).notNull(),
  direction: varchar("direction", { length: 10 }).notNull(), // entrant | sortant
  body: text("body").notNull(),
  origin: varchar("origin", { length: 12 }).default("client").notNull(), // client | auto | humain
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/* Comptabilité SYSCOHADA (points 10-11)                               */
/* ------------------------------------------------------------------ */

/** Écriture comptale (une opération = une écriture équilibrée débit/crédit). */
export const accountingEntries = pgTable(
  "accountingEntries",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organizationId").notNull(),
    /** Journal : VT ventes · AC achats · BQ banque · CA caisses · OD divers */
    journalCode: varchar("journalCode", { length: 2 }).notNull(),
    entryDate: timestamp("entryDate").defaultNow().notNull(),
    reference: varchar("reference", { length: 64 }).notNull(),
    /** sale | purchase | purchase_payment | online_payment | movement */
    refType: varchar("refType", { length: 40 }).notNull(),
    refId: integer("refId"),
    label: varchar("label", { length: 240 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    /** Idempotence : une même opération ne produit qu'une seule écriture. */
    entryRefUnique: uniqueIndex("accounting_entries_ref_unique").on(table.organizationId, table.refType, table.refId),
  }),
);

/** Lignes d'écriture : un numéro de compte SYSCOHADA, un débit ou un crédit. */
export const accountingLines = pgTable("accountingLines", {
  id: serial("id").primaryKey(),
  entryId: integer("entryId").notNull(),
  organizationId: integer("organizationId").notNull(),
  accountNumber: varchar("accountNumber", { length: 8 }).notNull(),
  accountLabel: varchar("accountLabel", { length: 160 }).notNull(),
  debit: numeric("debit", { precision: 16, scale: 2 }).default("0").notNull(),
  credit: numeric("credit", { precision: 16, scale: 2 }).default("0").notNull(),
});

/** Ligne de relevé bancaire importée, à rapprocher d'un mouvement de trésorerie. */
export const bankStatementLines = pgTable("bankStatementLines", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  accountId: integer("accountId").notNull(), // compte de trésorerie « banque »
  statementDate: timestamp("statementDate").notNull(),
  label: varchar("label", { length: 240 }).notNull(),
  /** Positif = crédit de relevé (entrée de fonds), négatif = débit de relevé. */
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  currency: currencyEnum("currency").default("XOF").notNull(),
  matchedMovementId: integer("matchedMovementId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/* Reçus clients (point 13)                                            */
/* ------------------------------------------------------------------ */

/** Journal des reçus émis (téléchargés ou envoyés par e-mail). */
export const receiptLogs = pgTable("receiptLogs", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  kind: varchar("kind", { length: 10 }).notNull(), // sale | order
  refId: integer("refId").notNull(),
  reference: varchar("reference", { length: 32 }).notNull(),
  recipient: varchar("recipient", { length: 320 }),
  status: varchar("status", { length: 12 }).notNull(), // envoye | simulation | telecharge | erreur
  detail: text("detail"),
  sentByUserId: integer("sentByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/* Types dérivés                                                       */
/* ------------------------------------------------------------------ */

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Organization = typeof organizations.$inferSelect;
export type Store = typeof stores.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type Sale = typeof sales.$inferSelect;
export type SalePayment = typeof salePayments.$inferSelect;
export type ProductionOrder = typeof productionOrders.$inferSelect;
export type PurchaseRequest = typeof purchaseRequests.$inferSelect;
export type TreasuryAccount = typeof treasuryAccounts.$inferSelect;
export type Employee = typeof employees.$inferSelect;
