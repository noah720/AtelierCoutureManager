/**
 * Achats de fournitures (point 9 de la présentation).
 *
 * Circuit : l'acheteur donne son avis → le comptable valide → la direction
 * approuve (sauf < 50 000 F CFA : le comptable seul suffit). Les petites
 * dépenses (< 2 000 XOF par facture) peuvent être payées depuis la petite
 * caisse de 20 000 XOF du magasinier, avec le visa du comptable.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import { employees, purchaseRequestItems, purchaseRequests, treasuryAccounts, treasuryMovements } from "../../drizzle/schema";
import { requireOrganization } from "../guards";
import { requireDb, loadRates } from "./shared";
import { nextPurchaseStatusOnAccountantApproval, nextPurchaseStatusOnBuyerApproval, nextPurchaseStatusOnDirectorApproval, PETTY_CASH_LIMIT_PER_INVOICE } from "./purchaseDomain";
import { toXof } from "../domain/money";

export const purchasesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const { organizationId } = await requireOrganization(ctx.user.id);
    const db = await requireDb();
    return db.select().from(purchaseRequests).where(eq(purchaseRequests.organizationId, organizationId)).orderBy(desc(purchaseRequests.createdAt)).limit(100);
  }),

  detail: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id);
      const db = await requireDb();
      const [request] = await db
        .select()
        .from(purchaseRequests)
        .where(eq(purchaseRequests.id, input.id))
        .limit(1);
      if (!request || request.organizationId !== organizationId) throw new TRPCError({ code: "NOT_FOUND", message: "Demande d'achat introuvable." });
      const items = await db.select().from(purchaseRequestItems).where(eq(purchaseRequestItems.requestId, request.id));
      return { request, items };
    }),

  create: protectedProcedure
    .input(
      z.object({
        supplier: z.string().max(160).optional(),
        items: z.array(z.object({ label: z.string().min(2).max(200), quantity: z.number().int().positive(), unitPrice: z.string().regex(/^\d+(\.\d{1,2})?$/) })).min(1).max(50),
        notes: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager", "staff"]);
      const db = await requireDb();
      const total = input.items.reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0);
      const [request] = await db
        .insert(purchaseRequests)
        .values({
          organizationId,
          requestedByUserId: ctx.user.id,
          requesterName: ctx.user.name ?? "Utilisateur",
          supplier: input.supplier ?? null,
          totalAmount: String(Math.round(total * 100) / 100),
          status: "proposee",
          buyerNote: input.notes ?? null,
        })
        .returning();
      await db.insert(purchaseRequestItems).values(input.items.map((item) => ({ requestId: request.id, label: item.label, quantity: item.quantity, unitPrice: item.unitPrice })));
      return request;
    }),

  /** Validation par étape : l'étape suivante est déduite du statut courant. */
  validate: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), step: z.enum(["acheteur", "comptable", "direction"]), note: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager", "staff"]);
      const db = await requireDb();
      const [request] = await db
        .select()
        .from(purchaseRequests)
        .where(and(eq(purchaseRequests.id, input.id), eq(purchaseRequests.organizationId, organizationId)))
        .limit(1);
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Demande d'achat introuvable." });

      // Le rôle fonctionnel est déduit du poste de l'employé lié au compte.
      const [employee] = await db
        .select({ jobTitle: employees.jobTitle })
        .from(employees)
        .where(eq(employees.userId, ctx.user.id))
        .limit(1);
      const jobTitle = employee?.jobTitle ?? "";
      const isManager = ["owner", "manager"].includes((await requireOrganization(ctx.user.id)).role);
      const isPurchaser = isManager || /achat/i.test(jobTitle);
      const isAccountant = isManager || /comptab/i.test(jobTitle);
      const isDirector = isManager;

      if (input.step === "acheteur" && !isPurchaser) throw new TRPCError({ code: "FORBIDDEN", message: "Étape réservée au service achats." });
      if (input.step === "comptable" && !isAccountant) throw new TRPCError({ code: "FORBIDDEN", message: "Étape réservée au comptable." });
      if (input.step === "direction" && !isDirector) throw new TRPCError({ code: "FORBIDDEN", message: "Étape réservée à la direction." });

      const totalXof = await (async () => {
        const rates = await loadRates();
        return toXof(Number(request.totalAmount), request.currency, rates);
      })();

      let nextStatus;
      if (input.step === "acheteur") {
        if (request.status !== "proposee") throw new TRPCError({ code: "BAD_REQUEST", message: "Cette demande n’est pas en attente d’avis acheteur." });
        nextStatus = nextPurchaseStatusOnBuyerApproval();
      } else if (input.step === "comptable") {
        if (request.status !== "valide_acheteur") throw new TRPCError({ code: "BAD_REQUEST", message: "L’avis de l’acheteur est requis d’abord." });
        nextStatus = nextPurchaseStatusOnAccountantApproval(totalXof);
      } else {
        if (request.status !== "valide_comptable") throw new TRPCError({ code: "BAD_REQUEST", message: "Cette demande ne nécessite pas la direction (ou n’y est pas encore)." });
        nextStatus = nextPurchaseStatusOnDirectorApproval();
      }

      await db
        .update(purchaseRequests)
        .set({
          status: nextStatus,
          ...(input.step === "acheteur" ? { buyerNote: input.note ?? request.buyerNote } : {}),
          ...(input.step === "comptable" ? { accountantNote: input.note ?? request.accountantNote } : {}),
          ...(input.step === "direction" ? { directorNote: input.note ?? request.directorNote } : {}),
          ...(nextStatus === "approubee" ? { decidedAt: new Date() } : {}),
        })
        .where(eq(purchaseRequests.id, request.id));
      return { status: nextStatus } as const;
    }),

  refuse: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), note: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager", "staff"]);
      const db = await requireDb();
      const [request] = await db
        .select()
        .from(purchaseRequests)
        .where(and(eq(purchaseRequests.id, input.id), eq(purchaseRequests.organizationId, organizationId)))
        .limit(1);
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Demande introuvable." });
      if (!["proposee", "valide_acheteur", "valide_comptable"].includes(request.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cette demande est déjà finalisée." });
      }
      await db.update(purchaseRequests).set({ status: "refusee", accountantNote: input.note ?? null, decidedAt: new Date() }).where(eq(purchaseRequests.id, request.id));
      return { success: true } as const;
    }),

  /**
   * Paiement d'un achat approuvé : sortie de trésorerie depuis le compte
   * choisi (petite caisse possible uniquement < 2 000 XOF par facture).
   */
  pay: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), accountId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager"]);
      const db = await requireDb();
      const [request] = await db
        .select()
        .from(purchaseRequests)
        .where(and(eq(purchaseRequests.id, input.id), eq(purchaseRequests.organizationId, organizationId)))
        .limit(1);
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Demande introuvable." });
      if (request.status !== "approubee" && request.status !== "commandee") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "L’achat doit être approuvé avant paiement." });
      }
      const [account] = await db
        .select()
        .from(treasuryAccounts)
        .where(and(eq(treasuryAccounts.id, input.accountId), eq(treasuryAccounts.organizationId, organizationId)))
        .limit(1);
      if (!account) throw new TRPCError({ code: "BAD_REQUEST", message: "Compte de trésorerie introuvable." });

      const rates = await loadRates();
      const amountInAccount = toXof(Number(request.totalAmount), request.currency, rates);
      if (account.type === "petite_caisse" && Number(request.totalAmount) >= PETTY_CASH_LIMIT_PER_INVOICE) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: `La petite caisse ne couvre que les achats de moins de ${PETTY_CASH_LIMIT_PER_INVOICE} XOF.` });
      }
      await db.insert(treasuryMovements).values({
        organizationId,
        accountId: account.id,
        direction: "sortie",
        amount: String(amountInAccount),
        currency: account.currency,
        category: account.type === "petite_caisse" ? "petite_caisse" : "achat",
        refType: "purchase",
        refId: request.id,
        label: `Achat ${request.supplier ?? ""} — ${request.requesterName}`.trim(),
        createdByUserId: ctx.user.id,
      });
      await db.update(purchaseRequests).set({ status: "recue", decidedAt: new Date() }).where(eq(purchaseRequests.id, request.id));
      return { success: true } as const;
    }),
});
