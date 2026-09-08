/**
 * Garde d'accès partagés : rôle au sein d'une marque (tenant) et
 * administration globale de la plateforme (équipe ENVOL).
 */
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { organizationMembers } from "../drizzle/schema";

export type MemberRole = "owner" | "manager" | "staff";

export function assertAllowedRole(role: MemberRole, allowedRoles: Array<MemberRole>) {
  if (!allowedRoles.includes(role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Votre rôle ne permet pas cette action." });
  }
}

/** Vérifie l'appartenance à une marque et le rôle autorisé. */
export async function requireOrganization(
  userId: number,
  allowedRoles: Array<MemberRole> = ["owner", "manager", "staff"],
): Promise<{ organizationId: number; role: MemberRole }> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Base de données indisponible." });
  const membership = await db
    .select({ organizationId: organizationMembers.organizationId, role: organizationMembers.role })
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, userId))
    .limit(1);
  const current = membership[0];
  if (!current) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Aucune marque n’est encore associée à ce compte." });
  }
  assertAllowedRole(current.role, allowedRoles);
  return current;
}
