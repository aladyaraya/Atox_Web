/** Local launcher: reads lab-only credentials; never changes .env.local. */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
const root = path.resolve(".data/oidc-sandbox/local");
try {
  const discovery = await fetch(
    "http://127.0.0.1:3301/oidc/.well-known/openid-configuration",
    { signal: AbortSignal.timeout(5000) },
  ).then((r) => {
    if (!r.ok) throw new Error();
    return r.json();
  });
  if (discovery.issuer !== "http://127.0.0.1:3301/oidc") throw new Error();
  const clients = JSON.parse(
    await readFile("labs/logto-oidc/.data/clients.json", "utf8"),
  );
  if (!clients.website?.appId || !clients.website.appSecret) throw new Error();
  await mkdir(root, { recursive: true });
  const secretsFile = path.join(root, "secrets.json");
  let secrets;
  try {
    secrets = JSON.parse(await readFile(secretsFile, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    secrets = {
      auth: randomBytes(32).toString("hex"),
      encryption: randomBytes(32).toString("hex"),
    };
    await writeFile(secretsFile, JSON.stringify(secrets), {
      mode: 0o600,
      flag: "wx",
    });
  }
  const env = {
    ...process.env,
    NODE_ENV: "development",
    ENABLE_LOGTO_LOGIN: "true",
    ENABLE_DEV_MAIL: "false",
    ENABLE_TICKETING_PREVIEW: "false",
    DB_PATH: path.join(root, "db"),
    UPLOAD_PATH: path.join(root, "uploads"),
    APP_ORIGIN: "http://127.0.0.1:3104",
    NEXT_DIST_DIR: ".next-oidc-preview",
    LOGTO_ENDPOINT: "http://127.0.0.1:3301",
    LOGTO_ISSUER: discovery.issuer,
    LOGTO_APP_ID: clients.website.appId,
    LOGTO_APP_SECRET: clients.website.appSecret,
    AUTH_SECRET: secrets.auth,
    OIDC_ENCRYPTION_SECRET: secrets.encryption,
    OIDC_EMAIL_TRUST: "local-sandbox",
    TRUST_PROXY: "false",
  };
  console.log(
    "Starting isolated website at http://127.0.0.1:3104. Mailpit: http://127.0.0.1:13325. Real website environment and data are unchanged.",
  );
  const child = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3104",
    ],
    { stdio: "inherit", env },
  );
  for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, () => child.kill(signal));
  child.on("exit", (code) => process.exit(code ?? 1));
} catch {
  console.error(
    "Local Logto sandbox is not ready. Start Docker Desktop, then from labs/logto-oidc run: npm ci; npm run init; npm run up; npm run provision. Return to the project root and run npm run oidc:preview. No domain is needed. No real user data was accessed.",
  );
  process.exitCode = 1;
}
