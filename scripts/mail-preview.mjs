/** Local-only SMTP sandbox. Never loads or changes the main website's DB. */
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { spawn } from "node:child_process";
import path from "node:path";

try {
  const root = path.resolve(".data/mail-test");
  const settings = parseEnv(
    await readFile(path.join(root, ".env.local"), "utf8"),
  );
  const required = [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_SECURE",
    "SMTP_USER",
    "SMTP_FROM",
    "SMTP_PASSWORD",
    "AUTH_SECRET",
  ];
  if (settings.MAIL_TEST_ALLOW_ANY_RECIPIENT !== "true")
    required.push("MAIL_TEST_RECIPIENT");
  if (
    required.some((key) => !settings[key]?.trim()) ||
    settings.AUTH_SECRET.length < 32
  )
    throw new Error("Incomplete local mail configuration");
  const env = {
    ...process.env,
    ...settings,
    NODE_ENV: "development",
    MAIL_TRANSPORT: "smtp",
    MAIL_LOCAL_SCOPE: "sandbox",
    ENABLE_DEV_MAIL: "false",
    ENABLE_LOGTO_LOGIN: "false",
    ENABLE_TICKETING_PREVIEW: "false",
    TRUST_PROXY: "false",
    DB_PATH: path.join(root, "db"),
    UPLOAD_PATH: path.join(root, "uploads"),
    APP_ORIGIN: "http://127.0.0.1:3105",
    NEXT_DIST_DIR: ".next-mail-test",
    NEXT_TELEMETRY_DISABLED: "1",
  };
  for (const key of Object.keys(env))
    if (key.startsWith("LOGTO_") || key.startsWith("OIDC_")) delete env[key];
  console.log(
    "Local SMTP sandbox: http://127.0.0.1:3105/login (OIDC disabled; main environment and data untouched).",
  );
  console.log(
    settings.MAIL_TEST_ALLOW_ANY_RECIPIENT === "true"
      ? "Recipient mode: any single valid email address."
      : "Recipient mode: configured test address only.",
  );
  const child = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3105",
    ],
    { env, stdio: "inherit" },
  );
  for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, () => child.kill(signal));
  child.on("exit", (code) => process.exit(code ?? 1));
} catch {
  console.error(
    "Cannot start mail sandbox. Check .data/mail-test/.env.local; secret values are not printed.",
  );
  process.exitCode = 1;
}
