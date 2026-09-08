import { defineConfig } from "drizzle-kit";

// PostgreSQL est la cible unique (Neon en production, PGlite en local).
// `db:generate` ne nécessite pas de base connectée : on fournit une URL factice.
const connectionString = process.env.DATABASE_URL ?? "postgres://localhost:5432/atelier";

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
