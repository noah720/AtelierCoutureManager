CREATE TYPE "public"."onlinePaymentStatus" AS ENUM('en_attente', 'succes', 'echec');--> statement-breakpoint
CREATE TYPE "public"."orderChannel" AS ENUM('boutique', 'en_ligne');--> statement-breakpoint
CREATE TYPE "public"."orderPaymentStatus" AS ENUM('impaye', 'paye', 'rembourse');--> statement-breakpoint
CREATE TYPE "public"."zoneKind" AS ENUM('locale', 'internationale');--> statement-breakpoint
CREATE TABLE "deliveryZones" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"name" varchar(120) NOT NULL,
	"kind" "zoneKind" DEFAULT 'locale' NOT NULL,
	"fee" numeric(14, 2) DEFAULT '0' NOT NULL,
	"currency" "currency" DEFAULT 'XOF' NOT NULL,
	"etaDays" integer,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onlinePayments" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"orderId" integer NOT NULL,
	"provider" varchar(40) DEFAULT 'moneroo' NOT NULL,
	"mode" varchar(20) DEFAULT 'simulation' NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" "currency" DEFAULT 'XOF' NOT NULL,
	"status" "onlinePaymentStatus" DEFAULT 'en_attente' NOT NULL,
	"providerRef" varchar(160),
	"checkoutUrl" text,
	"customerEmail" varchar(320),
	"paidAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "channel" "orderChannel" DEFAULT 'boutique' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "paymentStatus" "orderPaymentStatus" DEFAULT 'impaye' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "referralCode" varchar(32);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "deliveryZoneId" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "deliveryFee" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "deliveryName" varchar(160);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "deliveryPhone" varchar(40);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "deliveryAddress" text;--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_zones_name_unique" ON "deliveryZones" USING btree ("organizationId","name");