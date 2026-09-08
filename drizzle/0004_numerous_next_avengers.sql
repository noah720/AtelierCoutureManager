CREATE TABLE "receiptLogs" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"kind" varchar(10) NOT NULL,
	"refId" integer NOT NULL,
	"reference" varchar(32) NOT NULL,
	"recipient" varchar(320),
	"status" varchar(12) NOT NULL,
	"detail" text,
	"sentByUserId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
