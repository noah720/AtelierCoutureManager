CREATE TABLE "accountingEntries" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"journalCode" varchar(2) NOT NULL,
	"entryDate" timestamp DEFAULT now() NOT NULL,
	"reference" varchar(64) NOT NULL,
	"refType" varchar(40) NOT NULL,
	"refId" integer,
	"label" varchar(240) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accountingLines" (
	"id" serial PRIMARY KEY NOT NULL,
	"entryId" integer NOT NULL,
	"organizationId" integer NOT NULL,
	"accountNumber" varchar(8) NOT NULL,
	"accountLabel" varchar(160) NOT NULL,
	"debit" numeric(16, 2) DEFAULT '0' NOT NULL,
	"credit" numeric(16, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bankStatementLines" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"accountId" integer NOT NULL,
	"statementDate" timestamp NOT NULL,
	"label" varchar(240) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" "currency" DEFAULT 'XOF' NOT NULL,
	"matchedMovementId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "accounting_entries_ref_unique" ON "accountingEntries" USING btree ("organizationId","refType","refId");