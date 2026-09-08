CREATE TABLE "aiMessages" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"channel" varchar(20) DEFAULT 'whatsapp' NOT NULL,
	"customerName" varchar(160) NOT NULL,
	"direction" varchar(10) NOT NULL,
	"body" text NOT NULL,
	"origin" varchar(12) DEFAULT 'client' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aiPosts" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"channel" varchar(20) NOT NULL,
	"kind" varchar(28) NOT NULL,
	"productId" integer,
	"title" varchar(200) NOT NULL,
	"content" text NOT NULL,
	"status" varchar(16) DEFAULT 'brouillon' NOT NULL,
	"scheduledAt" timestamp,
	"publishedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "aiMode" varchar(20) DEFAULT 'brouillon' NOT NULL;