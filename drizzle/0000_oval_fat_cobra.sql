CREATE TYPE "public"."accountType" AS ENUM('caisse_boutique', 'caisse_centrale', 'banque', 'mobile_money', 'tpe', 'boutique_en_ligne', 'petite_caisse');--> statement-breakpoint
CREATE TYPE "public"."bonusType" AS ENUM('meilleur_semaine', 'meilleur_mois', 'gros_achat', 'fidelite', 'autre');--> statement-breakpoint
CREATE TYPE "public"."currency" AS ENUM('XOF', 'XAF', 'USD', 'EUR');--> statement-breakpoint
CREATE TYPE "public"."employeeType" AS ENUM('boutique', 'administration', 'atelier');--> statement-breakpoint
CREATE TYPE "public"."memberRole" AS ENUM('owner', 'manager', 'staff');--> statement-breakpoint
CREATE TYPE "public"."movementCategory" AS ENUM('vente', 'achat', 'paie', 'petite_caisse', 'abonnement', 'ajustement', 'autre');--> statement-breakpoint
CREATE TYPE "public"."movementDirection" AS ENUM('entree', 'sortie');--> statement-breakpoint
CREATE TYPE "public"."orderStatus" AS ENUM('pending', 'confirmed', 'in_production', 'ready', 'delivered', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."orgPlan" AS ENUM('boutique', 'atelier_boutique', 'complet');--> statement-breakpoint
CREATE TYPE "public"."orgStatus" AS ENUM('trial', 'active', 'grace', 'blocked', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."paymentMethod" AS ENUM('cash', 'mobile_money', 'tpe', 'card', 'transfer', 'online');--> statement-breakpoint
CREATE TYPE "public"."productFamily" AS ENUM('vetement', 'accessoire');--> statement-breakpoint
CREATE TYPE "public"."productGamme" AS ENUM('leader', 'vip', 'royale', 'presidentiel');--> statement-breakpoint
CREATE TYPE "public"."productGenre" AS ENUM('femme', 'homme', 'enfant');--> statement-breakpoint
CREATE TYPE "public"."productionStage" AS ENUM('coupe', 'couture', 'broderie', 'finition', 'controle_qualite', 'emballage', 'livraison');--> statement-breakpoint
CREATE TYPE "public"."productionStatus" AS ENUM('ouverte', 'en_cours', 'terminee', 'annulee');--> statement-breakpoint
CREATE TYPE "public"."productionType" AS ENUM('commande', 'confection', 'retouche');--> statement-breakpoint
CREATE TYPE "public"."purchaseStatus" AS ENUM('proposee', 'valide_acheteur', 'valide_comptable', 'approubee', 'commandee', 'recue', 'refusee');--> statement-breakpoint
CREATE TYPE "public"."saleStatus" AS ENUM('partielle', 'payee', 'annulee');--> statement-breakpoint
CREATE TYPE "public"."subscriptionPaymentStatus" AS ENUM('en_attente', 'valide', 'refuse');--> statement-breakpoint
CREATE TYPE "public"."taskStatus" AS ENUM('assignee', 'terminee');--> statement-breakpoint
CREATE TYPE "public"."ticketStatus" AS ENUM('ouvert', 'en_cours', 'resolu', 'ferme');--> statement-breakpoint
CREATE TYPE "public"."userRole" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "attendanceSessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"storeId" integer,
	"checkInAt" timestamp DEFAULT now() NOT NULL,
	"checkOutAt" timestamp,
	"locationOk" boolean DEFAULT true NOT NULL,
	"incident" text
);
--> statement-breakpoint
CREATE TABLE "bonuses" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"type" "bonusType" DEFAULT 'autre' NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"note" text,
	"awardedByUserId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"firstName" varchar(80) NOT NULL,
	"lastName" varchar(80) NOT NULL,
	"email" varchar(320),
	"phone" varchar(40),
	"city" varchar(100),
	"birthday" date,
	"photoUrl" text,
	"measurements" text,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"userId" integer,
	"storeId" integer,
	"firstName" varchar(80) NOT NULL,
	"lastName" varchar(80) NOT NULL,
	"type" "employeeType" DEFAULT 'boutique' NOT NULL,
	"jobTitle" varchar(80) NOT NULL,
	"baseSalaryMonthly" numeric(14, 2) DEFAULT '0' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchangeRates" (
	"code" varchar(3) PRIMARY KEY NOT NULL,
	"rateToXof" numeric(16, 6) NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"storeId" integer NOT NULL,
	"variantId" integer NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"reorderLevel" integer DEFAULT 5 NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventoryMovements" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"storeId" integer NOT NULL,
	"variantId" integer NOT NULL,
	"delta" integer NOT NULL,
	"reason" varchar(60) DEFAULT 'ajustement' NOT NULL,
	"note" text,
	"createdByUserId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orderItems" (
	"id" serial PRIMARY KEY NOT NULL,
	"orderId" integer NOT NULL,
	"variantId" integer NOT NULL,
	"quantity" integer NOT NULL,
	"unitPrice" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"storeId" integer NOT NULL,
	"customerId" integer NOT NULL,
	"reference" varchar(32) NOT NULL,
	"status" "orderStatus" DEFAULT 'pending' NOT NULL,
	"totalAmount" numeric(14, 2) NOT NULL,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizationMembers" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"userId" integer NOT NULL,
	"role" "memberRole" DEFAULT 'staff' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(160) NOT NULL,
	"slug" varchar(96) NOT NULL,
	"country" varchar(80),
	"sector" varchar(120),
	"currency" "currency" DEFAULT 'XOF' NOT NULL,
	"logoUrl" text,
	"plan" "orgPlan" DEFAULT 'boutique' NOT NULL,
	"status" "orgStatus" DEFAULT 'trial' NOT NULL,
	"trialEndsAt" timestamp NOT NULL,
	"subscriptionEndsAt" timestamp,
	"shopUrl" text,
	"customDomain" text,
	"domainVerified" boolean DEFAULT false NOT NULL,
	"referralCustomerRate" numeric(5, 2) DEFAULT '10' NOT NULL,
	"referralAffiliateRate" numeric(5, 2) DEFAULT '10' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "productVariants" (
	"id" serial PRIMARY KEY NOT NULL,
	"productId" integer NOT NULL,
	"sku" varchar(64) NOT NULL,
	"size" varchar(32),
	"color" varchar(64),
	"price" numeric(14, 2) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "productVariants_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "productionOrders" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"type" "productionType" DEFAULT 'commande' NOT NULL,
	"orderId" integer,
	"storeId" integer,
	"customerId" integer,
	"label" varchar(200) NOT NULL,
	"measurements" text,
	"notes" text,
	"dueDate" date,
	"stage" "productionStage" DEFAULT 'coupe' NOT NULL,
	"status" "productionStatus" DEFAULT 'ouverte' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "productionTasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"productionOrderId" integer NOT NULL,
	"employeeId" integer,
	"task" varchar(120) NOT NULL,
	"withEmbroidery" boolean DEFAULT false NOT NULL,
	"rate" numeric(14, 2) DEFAULT '0' NOT NULL,
	"status" "taskStatus" DEFAULT 'assignee' NOT NULL,
	"completedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"name" varchar(160) NOT NULL,
	"family" "productFamily" DEFAULT 'vetement' NOT NULL,
	"category" varchar(80) NOT NULL,
	"genre" "productGenre" DEFAULT 'homme' NOT NULL,
	"gamme" "productGamme" DEFAULT 'leader' NOT NULL,
	"sizes" text,
	"description" text,
	"basePrice" numeric(14, 2) NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchaseRequestItems" (
	"id" serial PRIMARY KEY NOT NULL,
	"requestId" integer NOT NULL,
	"label" varchar(200) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unitPrice" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchaseRequests" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"requestedByUserId" integer,
	"requesterName" varchar(160) NOT NULL,
	"supplier" varchar(160),
	"totalAmount" numeric(14, 2) NOT NULL,
	"currency" "currency" DEFAULT 'XOF' NOT NULL,
	"status" "purchaseStatus" DEFAULT 'proposee' NOT NULL,
	"buyerNote" text,
	"accountantNote" text,
	"directorNote" text,
	"decidedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"code" varchar(32) NOT NULL,
	"ownerCustomerId" integer,
	"ownerName" varchar(160),
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saleItems" (
	"id" serial PRIMARY KEY NOT NULL,
	"saleId" integer NOT NULL,
	"variantId" integer NOT NULL,
	"quantity" integer NOT NULL,
	"unitPrice" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salePayments" (
	"id" serial PRIMARY KEY NOT NULL,
	"saleId" integer NOT NULL,
	"method" "paymentMethod" NOT NULL,
	"currency" "currency" DEFAULT 'XOF' NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"reference" varchar(120),
	"mobileNumber" varchar(40),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"storeId" integer NOT NULL,
	"customerId" integer,
	"sellerUserId" integer,
	"reference" varchar(32) NOT NULL,
	"totalAmount" numeric(14, 2) NOT NULL,
	"discountAmount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"currency" "currency" DEFAULT 'XOF' NOT NULL,
	"referralCode" varchar(32),
	"status" "saleStatus" DEFAULT 'payee' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"name" varchar(160) NOT NULL,
	"kind" varchar(20) DEFAULT 'boutique' NOT NULL,
	"city" varchar(100),
	"address" text,
	"currency" "currency" DEFAULT 'XOF' NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptionPayments" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"plan" "orgPlan" NOT NULL,
	"months" integer DEFAULT 1 NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" "currency" DEFAULT 'XOF' NOT NULL,
	"method" varchar(40) DEFAULT 'mobile_money' NOT NULL,
	"reference" varchar(120),
	"status" "subscriptionPaymentStatus" DEFAULT 'en_attente' NOT NULL,
	"validatedByUserId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supportTicketMessages" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticketId" integer NOT NULL,
	"authorName" varchar(160) NOT NULL,
	"authorSide" varchar(20) DEFAULT 'client' NOT NULL,
	"message" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supportTickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer,
	"userId" integer,
	"reporterName" varchar(160) NOT NULL,
	"pageUrl" text,
	"subject" varchar(200) NOT NULL,
	"message" text NOT NULL,
	"status" "ticketStatus" DEFAULT 'ouvert' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "taskRates" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"task" varchar(120) NOT NULL,
	"withEmbroidery" boolean DEFAULT false NOT NULL,
	"rate" numeric(14, 2) NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "treasuryAccounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"type" "accountType" NOT NULL,
	"storeId" integer,
	"label" varchar(160) NOT NULL,
	"currency" "currency" DEFAULT 'XOF' NOT NULL,
	"openingBalance" numeric(14, 2) DEFAULT '0' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "treasuryMovements" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"accountId" integer NOT NULL,
	"direction" "movementDirection" NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" "currency" DEFAULT 'XOF' NOT NULL,
	"category" "movementCategory" DEFAULT 'autre' NOT NULL,
	"refType" varchar(40),
	"refId" integer,
	"label" varchar(240) NOT NULL,
	"createdByUserId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(160) NOT NULL,
	"email" varchar(320) NOT NULL,
	"passwordHash" text,
	"name" text,
	"loginMethod" varchar(64) DEFAULT 'local' NOT NULL,
	"role" "userRole" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_store_variant_unique" ON "inventory" USING btree ("storeId","variantId");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_organization_reference_unique" ON "orders" USING btree ("organizationId","reference");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_membership_unique" ON "organizationMembers" USING btree ("organizationId","userId");--> statement-breakpoint
CREATE UNIQUE INDEX "referrals_organization_code_unique" ON "referrals" USING btree ("organizationId","code");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_organization_reference_unique" ON "sales" USING btree ("organizationId","reference");--> statement-breakpoint
CREATE UNIQUE INDEX "task_rates_unique" ON "taskRates" USING btree ("organizationId","task","withEmbroidery");--> statement-breakpoint
CREATE UNIQUE INDEX "treasury_accounts_label_unique" ON "treasuryAccounts" USING btree ("organizationId","label");