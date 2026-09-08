CREATE TABLE "employeeSchedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"dayOfWeek" integer NOT NULL,
	"startTime" varchar(5) NOT NULL,
	"endTime" varchar(5) NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendanceSessions" ADD COLUMN "checkInLat" text;--> statement-breakpoint
ALTER TABLE "attendanceSessions" ADD COLUMN "checkInLng" text;--> statement-breakpoint
ALTER TABLE "attendanceSessions" ADD COLUMN "checkOutLat" text;--> statement-breakpoint
ALTER TABLE "attendanceSessions" ADD COLUMN "checkOutLng" text;--> statement-breakpoint
ALTER TABLE "attendanceSessions" ADD COLUMN "outsideMinutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "attendanceSessions" ADD COLUMN "autoClosed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bonuses" ADD COLUMN "periodKey" varchar(16);--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "latitude" text;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "longitude" text;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "geofenceRadius" integer DEFAULT 150 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "employee_schedules_day_unique" ON "employeeSchedules" USING btree ("employeeId","dayOfWeek");--> statement-breakpoint
CREATE UNIQUE INDEX "bonuses_period_unique" ON "bonuses" USING btree ("organizationId","employeeId","type","periodKey");