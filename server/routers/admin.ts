/**
 * Administration globale de la plateforme (équipe ENVOL AFRICA GROUPE,
 * point 2 de la présentation) : validation des marques, suivi des
 * abonnements, suspension/réactivation, demandes d'assistance.
 */
import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";
import { router, adminProcedure } from "../_core/trpc";
import { organizationMembers, organizations, users } from "../../drizzle/schema";
import { subscriptionAdminRouter } from "./organization";
import { requireDb } from "./shared";
import { effectiveOrgStatus } from "../domain/subscription";

export const adminRouter = router({
  subscriptions: subscriptionAdminRouter,

  organizations: adminProcedure.query(async () => {
    const db = await requireDb();
    const rows = await db
      .select({
        organization: organizations,
        members: sql<number>`(SELECT COUNT(*) FROM "organizationMembers" WHERE "organizationId" = "organizations"."id")`,
        ownerName: sql<string>`COALESCE((SELECT name FROM "users" u INNER JOIN "organizationMembers" m ON m."userId" = u.id WHERE m."organizationId" = "organizations"."id" AND m.role = 'owner' LIMIT 1), '—')`,
      })
      .from(organizations)
      .orderBy(desc(organizations.createdAt));
    return rows.map((row) => ({
      ...row,
      effectiveStatus: effectiveOrgStatus({
        status: row.organization.status,
        trialEndsAt: row.organization.trialEndsAt,
        subscriptionEndsAt: row.organization.subscriptionEndsAt,
      }),
    }));
  }),

  setOrganizationStatus: adminProcedure
    .input(z.object({ id: z.number().int().positive(), status: z.enum(["trial", "active", "grace", "blocked", "suspended"]) }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      await db.update(organizations).set({ status: input.status, updatedAt: new Date() }).where(eq(organizations.id, input.id));
      return { success: true } as const;
    }),

  stats: adminProcedure.query(async () => {
    const db = await requireDb();
    const [orgCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(organizations);
    const [activeCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(organizations).where(eq(organizations.status, "active"));
    const [userCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(users);
    const [pendingPayments] = await db.execute(sql`SELECT COUNT(*)::int AS count FROM "subscriptionPayments" WHERE status = 'en_attente'`).then((res) => {
      const rows = (res as unknown as { rows?: Array<{ count: number }> }).rows ?? (res as unknown as Array<{ count: number }>);
      return [Array.isArray(rows) && rows[0] ? rows[0] : { count: 0 }];
    });
    return {
      organizations: Number(orgCount?.count ?? 0),
      activeOrganizations: Number(activeCount?.count ?? 0),
      users: Number(userCount?.count ?? 0),
      pendingPayments: Number(pendingPayments?.count ?? 0),
    };
  }),
});
