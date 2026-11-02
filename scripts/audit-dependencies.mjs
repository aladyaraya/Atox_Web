/** Lockfile audit only; no installation, force fixes, secrets or live application data. */
import { spawnSync } from "node:child_process";
import path from "node:path";

const npm = process.env.npm_execpath;
if (!npm)
  throw new Error("Run npm run check:security so the current npm CLI is used.");
let failed = false;
for (const project of [".", "labs/logto-oidc"]) {
  for (const production of [false, true]) {
    const label = `${project} ${production ? "production" : "all"}`;
    const result = spawnSync(
      process.execPath,
      [
        npm,
        "audit",
        "--json",
        "--registry=https://registry.npmjs.org",
        "--fetch-timeout=30000",
        "--fetch-retries=1",
        ...(production ? ["--omit=dev"] : []),
      ],
      {
        cwd: path.resolve(project),
        encoding: "utf8",
        timeout: 90000,
        maxBuffer: 8 * 1024 * 1024,
      },
    );
    try {
      if (result.error || result.signal) throw new Error();
      const audit = JSON.parse(result.stdout);
      if (audit.error || !audit.metadata?.vulnerabilities) throw new Error();
      const counts = audit.metadata.vulnerabilities;
      console.log(`${label}: ${JSON.stringify(counts)}`);
      if (counts.high > 0 || counts.critical > 0) failed = true;
    } catch {
      // Raw npm/network output may contain environment details. Fail closed.
      console.error(
        `${label}: audit unavailable; cannot mark security check passed.`,
      );
      failed = true;
    }
  }
}
if (failed) process.exitCode = 1;
