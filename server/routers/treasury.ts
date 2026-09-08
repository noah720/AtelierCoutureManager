/**
 * Trésorerie (point 11 de la présentation) : chaque caisse est suivie
 * séparément (caisse de chaque boutique, caisse centrale, banque, mobile
 * money, TPE, boutique en ligne, petite caisse). Le solde d'un compte est
 * son solde d'ouverture plus la somme des mouvements.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import { treasuryAccounts, treasuryMovements } from "../../drizzle/schema";
import { requireOrganization } from "../guards";
import { requireDb } from "./shared";
import { PETTY_CASH_FUND } from "../domain/purchases";

export const treasuryRouter = router({
  accounts: protectedProcedure.query(async ({ ctx }) => {
    const { organizationId } = await requireOrganization(ctx.user.id);
    const db = await requireDb();
    return db
      .select({
        account: treasuryAccounts,
        balance: sql<string>`${treasuryAccounts.openingBalance} + COALESCE((SELECT SUM(CASE WHEN m.direction = 'entree' THEN m.amount ELSE -m.amount END) FROM "treasuryMovements" m WHERE m."accountId" = "treasuryAccounts"."id"), 0)`,
        movementsCount: sql<number>`(SELECT COUNT(*) FROM "treasuryMovements" m WHERE m."accountId" = "treasuryAccounts"."id")`,
      })
      .from(treasuryAccounts)
      .where(eq(treasuryAccounts.organizationId, organizationId))
      .orderBy(treasuryAccounts.label);
  }),

  movements: protectedProcedure
    .input(z.object({ accountId: z.number().int().positive().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id);
      const db = await requireDb();
      const where = input?.accountId
        ? and(eq(treasuryMovements.organizationId, organizationId), eq(treasuryMovements.accountId, input.accountId))
        : eq(treasuryMovements.organizationId, organizationId);
      return db.select().from(treasuryMovements).where(where).orderBy(desc(treasuryMovements.createdAt)).limit(150);
    }),

  createAccount: protectedProcedure
    .input(
      z.object({
        type: z.enum(["caisse_boutique", "caisse_centrale", "banque", "mobile_money", "tpe", "boutique_en_ligne", "petite_caisse"]),
        label: z.string().min(2).max(160),
        storeId: z.number().int().positive().optional(),
        currency: z.enum(["XOF", "XAF", "USD", "EUR"]).default("XOF"),
        openingBalance: z.string().regex(/^\d+(\.\d{1,2})?$/).default("0"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager"]);
      const db = await requireDb();
      const [account] = await db
        .insert(treasuryAccounts)
        .values({
          organizationId,
          type: input.type,
          label: input.label,
          storeId: input.storeId ?? null,
          currency: input.currency,
          openingBalance: input.openingBalance,
        })
        .onConflictDoNothing()
        .returning();
      if (!account) throw new TRPCError({ code: "CONFLICT", message: "Un compte porte déjà ce nom." });
      return account;
    }),

  /** Mouvement manuel : entrée/sortie (ajustement, paie, autre…). */
  recordMovement: protectedProcedure
    .input(
      z.object({
        accountId: z.number().int().positive(),
        direction: z.enum(["entree", "sortie"]),
        amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
        category: z.enum(["vente", "achat", "paie", "petite_caisse", "abonnement", "ajustement", "autre"]).default("autre"),
        label: z.string().min(2).max(240),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager", "staff"]);
      const db = await requireDb();
      const [account] = await db
        .select()
        .from(treasuryAccounts)
        .where(and(eq(treasuryAccounts.id, input.accountId), eq(treasuryAccounts.organizationId, organizationId)))
        .limit(1);
      if (!account) throw new TRPCError({ code: "BAD_REQUEST", message: "Compte introuvable." });
      const [movement] = await db
        .insert(treasuryMovements)
        .values({
          organizationId,
          accountId: account.id,
          direction: input.direction,
          amount: input.amount,
          currency: account.currency,
          category: input.category,
          label: input.label,
          createdByUserId: ctx.user.id,
        })
        .returning();
      return movement;
    }),

  /** Renflouement de la petite caisse (fond de 20 000 XOF, point 9). */
  refillPettyCash: protectedProcedure
    .input(z.object({ pettyAccountId: z.number().int().positive(), sourceAccountId: z.number().int().positive(), amount: z.string().regex(/^\d+(\.\d{1,2})?$/), note: z.string().max(300).optional() }))
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = await requireOrganization(ctx.user.id, ["owner", "manager", "staff"]);
      const db = await requireDb();
      const accounts = await db.select().from(treasuryAccounts).where(eq(treasuryAccounts.organizationId, organizationId));
      const petty = accounts.find((a) => a.id === input.pettyAccountId);
      const source = accounts.find((a) => a.id === input.sourceAccountId);
      if (!petty || petty.type !== "petite_caisse") throw new TRPCError({ code: "BAD_REQUEST", message: "Compte petite caisse introuvable." });
      if (!source) throw new TRPCError({ code: "BAD_REQUEST", message: "Compte source introuvable." });
      const amount = Number(input.amount);
      if (amount <= 0 || amount > PETTY_CASH_FUND) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Le renflouement est limité au fond de ${PETTY_CASH_FUND} XOF.` });
      }
      await db.insert(treasuryMovements).values([
        {
          organizationId,
          accountId: source.id,
          direction: "sortie" as const,
          amount: input.amount,
          currency: source.currency,
          category: "petite_caisse" as const,
          label: `Renflouement petite caisse ${input.note ?? ""}`.trim(),
          createdByUserId: ctx.user.id,
        },
        {
          organizationId,
          accountId: petty.id,
          direction: "entree" as const,
          amount: input.amount,
          currency: petty.currency,
          category: "petite_caisse" as const,
          label: `Renflouement depuis ${source.label}`,
          createdByUserId: ctx.user.id,
        },
      ]);
      return { success: true } as const;
    }),
});
