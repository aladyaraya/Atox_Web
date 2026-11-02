import { checkDeployment } from "../src/lib/deployment";
import { getDb, closeDb } from "../src/lib/db";
import { sql } from "drizzle-orm";
async function main() {
  const errors = checkDeployment();
  if (errors.length) {
    console.error("Release gates failed: " + errors.join(", "));
    process.exitCode = 1;
    return;
  }
  try {
    await (await getDb()).execute(sql`select id from users limit 1`);
    console.log(
      "Production configuration and database schema gates passed. Real mail delivery, cloud ACL, load and restore checks must be signed off separately.",
    );
  } catch {
    console.error(
      "Production database/schema check failed; connection details withheld.",
    );
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
void main();
