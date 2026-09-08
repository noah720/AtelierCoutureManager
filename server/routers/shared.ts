import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { exchangeRates } from "../../drizzle/schema";
import { DEFAULT_RATES, type RateMap } from "../domain/money";

export const moneySchema = z.string().regex(/^\d+(\.\d{1,2})?$/, "Montant invalide");

export async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Base de données indisponible." });
  return db;
}

/** Charge les taux de change (table exchangeRates, sinon valeurs par défaut). */
export async function loadRates(): Promise<RateMap> {
  const db = await getDb();
  if (!db) return { ...DEFAULT_RATES };
  const rows = await db.select().from(exchangeRates);
  const rates: RateMap = { ...DEFAULT_RATES };
  for (const row of rows) rates[row.code] = Number(row.rateToXof);
  return rates;
}

/** Génère la prochaine référence séquentielle pour une marque (ex. VTE-0007). */
export function makeReference(prefix: string, count: number): string {
  return `${prefix}-${String(count + 1).padStart(4, "0")}`;
}
