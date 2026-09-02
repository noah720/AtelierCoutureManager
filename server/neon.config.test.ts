import { describe, expect, it } from "vitest";

describe("Neon configuration", () => {
  it("exposes a PostgreSQL connection string for the production environment", async () => {
    const connectionString = process.env.NEON_DATABASE_URL;
    expect(connectionString, "NEON_DATABASE_URL doit être renseignée dans l’environnement de test").toMatch(/^postgresql:\/\//);

    const endpoint = new URL(connectionString!);
    expect(endpoint.protocol).toBe("postgresql:");
    expect(endpoint.hostname.length).toBeGreaterThan(0);
  });
});
