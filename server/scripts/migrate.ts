import "dotenv/config";
import { migrateDatabase, closeDatabase } from "../db";

async function main() {
  await migrateDatabase();
  console.log("[Migrations] Schéma PostgreSQL appliqué.");
  await closeDatabase();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
