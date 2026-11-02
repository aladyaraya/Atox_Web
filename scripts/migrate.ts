import { closeDb, migrateDatabase } from "../src/lib/db";

async function main() {
  try {
    await migrateDatabase();
    console.log("Database migrations applied.");
  } finally {
    await closeDb();
  }
}

main().catch((error) => {
  void error;
  console.error(
    "Migration failed; database credentials and query details withheld.",
  );
  process.exitCode = 1;
});
