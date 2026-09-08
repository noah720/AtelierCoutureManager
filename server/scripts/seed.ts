import "dotenv/config";
import { migrateDatabase, closeDatabase } from "../db";
import { seed } from "../seed";

async function main() {
  await migrateDatabase();
  await seed();
  await closeDatabase();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
