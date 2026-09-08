import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { router, publicProcedure } from "../_core/trpc";
import { hashPassword, normalizeEmail, sessionCookieOptions, verifyPassword, createSessionToken } from "../_core/auth";
import { getSessionCookieOptions } from "../_core/cookies";
import { users } from "../../drizzle/schema";
import { getDb } from "../db";
import { requireDb } from "./shared";

const publicUser = (user: { id: number; email: string; name: string | null; role: string; openId: string }) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  openId: user.openId,
});

export const authRouter = router({
  me: publicProcedure.query(({ ctx }) => (ctx.user ? publicUser(ctx.user) : null)),

  register: publicProcedure
    .input(
      z.object({
        name: z.string().min(2).max(120),
        email: z.string().email().max(320),
        password: z.string().min(8).max(128),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const email = normalizeEmail(input.email);
      const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      if (existing.length) throw new TRPCError({ code: "CONFLICT", message: "Un compte existe déjà avec cet e-mail." });
      const openId = `local:${email}`;
      const [created] = await db
        .insert(users)
        .values({
          openId,
          email,
          name: input.name,
          passwordHash: hashPassword(input.password),
          loginMethod: "local",
          lastSignedIn: new Date(),
        })
        .returning({ id: users.id, email: users.email, name: users.name, role: users.role, openId: users.openId });
      const token = await createSessionToken(created.id);
      ctx.res.cookie("app_session_id", token, sessionCookieOptions(ctx.req));
      // Le token est aussi renvoyé pour l'en-tête Authorization (contexts
      // sans cookies tiers, ex. aperçu en iframe).
      return { ...publicUser(created), token };
    }),

  login: publicProcedure
    .input(z.object({ email: z.string().email().max(320), password: z.string().min(1).max(128) }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const email = normalizeEmail(input.email);
      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (!user || !verifyPassword(input.password, user.passwordHash)) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "E-mail ou mot de passe incorrect." });
      }
      await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));
      const token = await createSessionToken(user.id);
      ctx.res.cookie("app_session_id", token, sessionCookieOptions(ctx.req));
      return { ...publicUser(user), token };
    }),

  logout: publicProcedure.mutation(({ ctx }) => {
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie("app_session_id", { ...cookieOptions, maxAge: -1 });
    return { success: true } as const;
  }),
});
