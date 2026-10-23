/** Stop the website sharing this PGlite directory before running this command. */
import { cleanupProjectFiles } from "../src/modules/project-submission/files";
import { closeDb } from "../src/lib/db";
async function main() {
  try {
    console.log(JSON.stringify(await cleanupProjectFiles()));
  } finally {
    await closeDb();
  }
}
main().catch(() => {
  console.error(
    "Project file cleanup failed; check private storage and stop the website before retrying.",
  );
  process.exitCode = 1;
});
