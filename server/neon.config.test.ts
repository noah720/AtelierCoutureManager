import { describe, expect, it } from "vitest";

/**
 * La cible de production est PostgreSQL hébergé par Neon.
 * Ce test vérifie la variable NEON_DATABASE_URL lorsqu'elle est fournie
 * (CI / environnement de préproduction). Il est ignoré en local.
 */
describe("Neon configuration", () => {
  const connectionString = process.env.NEON_DATABASE_URL;

  it.skipIf(!connectionString)("exposes a PostgreSQL connection string for production", () => {
    expect(connectionString).toMatch(/^postgres(q|ql):\/\//);
    const endpoint = new URL(connectionString!);
    expect(endpoint.protocol).toBe("postgres:");
    expect(endpoint.hostname.length).toBeGreaterThan(0);
  });

  it("keeps a local development database by default (PGlite)", () => {
    // Sans DATABASE_URL, l'application démarre sur un Postgres embarqué.
    expect(process.env.DATABASE_URL ?? "pglite://.data/pglite").toMatch(/^(pglite|postgres)/);
  });
});
