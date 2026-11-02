import { spawn } from "node:child_process";
import { labRoot, loadLabEnv, requireLab } from "../app/config.mjs";
loadLabEnv();
requireLab();
const db = new URL(process.env.LOGTO_LAB_DB_URL);
if (
  db.protocol !== "postgres:" ||
  db.host !== "postgres:5432" ||
  db.pathname !== "/m013_logto_lab" ||
  db.username !== "m013_lab" ||
  db.password !== process.env.LOGTO_LAB_POSTGRES_PASSWORD ||
  db.search ||
  db.hash
)
  throw new Error("Only the dedicated Compose PostgreSQL database is allowed.");
const args = process.argv.slice(2);
if (
  !["up", "down", "ps", "config", "pull"].includes(args[0]) ||
  args.some((arg) =>
    ["-v", "--volumes", "-f", "--file", "--project-directory"].includes(arg),
  )
)
  throw new Error(
    "Use the fixed lab Compose file; volume deletion and alternate files are not exposed.",
  );
const child = spawn(
  "docker",
  ["compose", "--env-file", ".env.lab", "-f", "compose.yaml", ...args],
  { cwd: labRoot, stdio: "inherit" },
);
child.on("error", () => {
  console.error(
    "Docker Compose is required; no system components were installed.",
  );
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
