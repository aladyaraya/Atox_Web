import { randomBytes } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { labRoot } from "../app/config.mjs";
await mkdir(path.join(labRoot, ".data"), { recursive: true });
const values = {
  NODE_ENV: "development",
  ENABLE_LOGTO_LAB: "true",
  LOGTO_LAB_ACK: "isolated-loopback-test-only",
  ...Object.fromEntries(
    [
      "POSTGRES_PASSWORD",
      "BOOTSTRAP_SECRET",
      "COOKIE_SECRET_A",
      "COOKIE_SECRET_B",
    ].map((key) => ["LOGTO_LAB_" + key, randomBytes(32).toString("hex")]),
  ),
};
const db = new URL("postgres://postgres:5432/m013_logto_lab");
db.username = "m013_lab";
db.password = values.LOGTO_LAB_POSTGRES_PASSWORD;
values.LOGTO_LAB_DB_URL = db.href;
await writeFile(
  path.join(labRoot, ".env.lab"),
  Object.entries(values)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n") + "\n",
  { mode: 0o600, flag: "wx" },
);
console.log(
  "Created lab-only .env.lab. Existing files are never overwritten. No website configuration was read.",
);
