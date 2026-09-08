/**
 * Authentification locale (email + mot de passe), sessions signées JWT
 * stockées dans un cookie httpOnly. Le rôle `admin` est réservé à l'équipe
 * opératrice ENVOL (administration de la plateforme).
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { Request } from "express";
import { parse as parseCookieHeader } from "cookie";
import { eq } from "drizzle-orm";
import { users, type User } from "../../drizzle/schema";
import { getDb } from "../db";

export const SESSION_COOKIE = "app_session_id";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 jours

function secretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET || "atelier-manager-dev-secret-change-me";
  return new TextEncoder().encode(secret);
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export async function createSessionToken(userId: number): Promise<string> {
  return new SignJWT({ sub: String(userId) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function readSessionUserId(req: Request): Promise<number | null> {
  const header = req.headers.cookie ?? "";
  const token = parseCookieHeader(header)[SESSION_COOKIE];
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const id = Number(payload.sub);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

export async function getSessionUser(req: Request): Promise<User | null> {
  const userId = await readSessionUserId(req);
  if (!userId) return null;
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result[0] ?? null;
}

export function sessionCookieOptions(req: Request) {
  const isSecure = req.protocol === "https" || req.headers["x-forwarded-proto"] === "https";
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: isSecure,
    maxAge: SESSION_TTL_SECONDS * 1000,
  };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
