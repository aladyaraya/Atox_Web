/** Test controller only. Never mounted in Next.js or enabled by app flags. */
import { createServer } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, closeDb } from "../../src/lib/db";
import { sendCode, verifyCode } from "../../src/modules/auth/service";
import { devMails } from "../../src/modules/auth/schema";
import { accountProfiles } from "../../src/modules/auth/profile-schema";
import { bootstrapAdministrator } from "../../src/modules/admin/service";
import { approveIdentityRecovery } from "../../src/modules/auth/oidc/service";

async function main() {
  const dir = path.resolve(process.env.OIDC_FIXTURE_DIR || "");
  if (
    path.dirname(dir) !== path.resolve(".data/oidc-sandbox") ||
    !/^browser-\d+$/.test(path.basename(dir))
  )
    throw new Error("Dedicated OIDC sandbox required");
  const clients = JSON.parse(
    await readFile("labs/logto-oidc/.data/clients.json", "utf8"),
  );
  if (!clients.website?.appId || !clients.website.appSecret)
    throw new Error("Provision website client first");
  Object.assign(process.env, {
    NODE_ENV: "development",
    ENABLE_LOGTO_LOGIN: "true",
    ENABLE_DEV_MAIL: "true",
    ENABLE_TICKETING_PREVIEW: "false",
    APP_ORIGIN: "http://127.0.0.1:3104",
    NEXT_DIST_DIR: ".next-oidc-browser",
    DB_PATH: path.join(dir, "db"),
    UPLOAD_PATH: path.join(dir, "uploads"),
    AUTH_SECRET: randomBytes(32).toString("hex"),
    OIDC_ENCRYPTION_SECRET: randomBytes(32).toString("hex"),
    OIDC_EMAIL_TRUST: "local-sandbox",
    LOGTO_ENDPOINT: "http://127.0.0.1:3301",
    LOGTO_ISSUER: "http://127.0.0.1:3301/oidc",
    LOGTO_APP_ID: clients.website.appId,
    LOGTO_APP_SECRET: clients.website.appSecret,
    TRUST_PROXY: "false",
  });
  await mkdir(dir, { recursive: true });
  const db = await getDb(),
    email = "owner@m014.example.test";
  await sendCode(email, "en", "oidc-browser-fixture");
  const [mail] = await db
    .select()
    .from(devMails)
    .where(eq(devMails.email, email));
  const owner = await verifyCode(email, mail.body.match(/\b\d{6}\b/)![0]);
  await db
    .insert(accountProfiles)
    .values({
      userId: owner.user.id,
      nickname: "Original owner",
      revision: 1,
      updatedAt: new Date(),
    });
  await bootstrapAdministrator(email, "isolated-oidc-browser-case");
  await closeDb();
  process.env.ENABLE_DEV_MAIL = "false";
  const controlSecret = randomBytes(32).toString("hex");
  await writeFile(
    path.join(dir, "fixture.json"),
    JSON.stringify({
      owner: { ...owner.user, token: owner.token },
      controlSecret,
    }),
    { mode: 0o600 },
  );
  let child: ChildProcess | null = null;
  let stopping = false;
  function start() {
    child = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "dev",
        "--hostname",
        "127.0.0.1",
        "--port",
        "3104",
      ],
      {
        env: process.env,
        stdio: "ignore",
        detached: process.platform !== "win32",
      },
    );
    child.on("exit", () => {
      if (!stopping) process.exitCode = 1;
    });
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    stopping = true;
    const exit = new Promise<void>((resolve) =>
      child!.once("exit", () => resolve()),
    );
    if (process.platform === "win32") {
      await new Promise<void>((resolve) =>
        spawn("taskkill", ["/pid", String(child!.pid), "/t", "/f"], {
          stdio: "ignore",
        }).on("exit", () => resolve()),
      );
    } else process.kill(-child.pid!, "SIGTERM");
    await exit;
    child = null;
  }
  async function ready() {
    for (let i = 0; i < 180; i++) {
      try {
        if ((await fetch("http://127.0.0.1:3104/login")).ok) return;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error("Website did not become ready");
  }
  // An isolated fixture controller lets tests exercise the real OFFLINE approval
  // boundary: stop Next, open DB once, close DB, restart. No public approval API.
  let busy = false;
  const control = createServer(async (req, res) => {
    const supplied = req.headers["x-fixture-secret"];
    if (
      typeof supplied !== "string" ||
      supplied.length !== controlSecret.length ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(controlSecret)) ||
      req.method !== "POST" ||
      !["/approve", "/restart"].includes(req.url || "")
    ) {
      res.writeHead(404).end();
      return;
    }
    if (busy) {
      res.writeHead(409).end();
      return;
    }
    busy = true;
    try {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 4096) throw new Error();
      }
      const input = JSON.parse(body);
      await stop();
      if (req.url === "/approve") {
        try {
          await approveIdentityRecovery({
            flowId: input.requestId,
            userId: owner.user.id,
            caseId: "isolated-browser-case",
            evidenceRef: "synthetic-fixture-proof-not-real-ownership",
            reviewedBy: "browser-fixture",
            acknowledgeReviewedEvidence: true,
          });
        } finally {
          await closeDb();
        }
      }
      stopping = false;
      start();
      await ready();
      res
        .writeHead(200, { "Content-Type": "application/json" })
        .end('{"ok":true}');
    } catch {
      res.writeHead(500).end("Fixture operation failed; details withheld");
    } finally {
      busy = false;
    }
  });
  control.listen(3105, "127.0.0.1");
  start();
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.on(
      signal,
      () => void stop().then(() => control.close(() => process.exit(0))),
    );
}
main().catch(() => {
  console.error("Isolated website fixture failed; sensitive details withheld.");
  process.exitCode = 1;
});
