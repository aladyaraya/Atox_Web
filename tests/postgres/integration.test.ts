/** Runs ONLY against a separately provisioned atox_ci_* database, never local users. */
import { before, after, test, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { eq, and } from "drizzle-orm";
import nodemailer from "nodemailer";
import {
  getDb,
  closeDb,
  migrateDatabase,
  serializeDatabaseWrite,
} from "../../src/lib/db";
import {
  sendCode,
  verifyCode,
  getUserByToken,
  revokeSession,
} from "../../src/modules/auth/service";
import { challenges, devMails, users } from "../../src/modules/auth/schema";
import { bootstrapAdministrator } from "../../src/modules/admin/service";
import { readEventRegistry } from "../../src/modules/content-management/store";
import { readPublicProjects } from "../../src/modules/project-submission/store";
let code = "",
  transportFailure = false;
before(async () => {
  const url = new URL(process.env.POSTGRES_TEST_URL || "");
  url.username=process.env.PGUSER||url.username;
  url.password=process.env.PGPASSWORD||url.password;
  if (!/^atox_ci_[a-z0-9_]+$/.test(url.pathname.slice(1)))
    throw new Error("Only isolated atox_ci_* databases are allowed");
  Object.assign(process.env, {
    NODE_ENV: "production",
    DEPLOYMENT_MODE: "production",
    DATABASE_DRIVER: "postgres",
    DATABASE_URL: url.href,
    DATABASE_AUTO_MIGRATE: "false",
    MAIL_TRANSPORT: "transactional-smtp",
    MAIL_DOMAIN_VERIFIED: "true",
    APP_ORIGIN: "https://website.example.test",
    AUTH_SECRET: randomBytes(32).toString("hex"),
    SMTP_HOST: "smtpdm-ap-southeast-1.aliyuncs.com",
    SMTP_PORT: "465",
    SMTP_SECURE: "true",
    SMTP_USER: "sender@example.test",
    SMTP_FROM: "sender@example.test",
    SMTP_PASSWORD: "synthetic-only",
    ENABLE_DEV_MAIL: "false",
    ENABLE_LOGTO_LOGIN: "false",
    ENABLE_TICKETING_PREVIEW: "false",
  });
  mock.method(nodemailer, "createTransport", () => ({
    sendMail: async (mail: { text: string; to: string }) => {
      code = mail.text.match(/\b\d{6}\b/)![0];
      if (transportFailure) throw new Error("provider failure");
      return { accepted: [mail.to] };
    },
    close() {},
  }));
  await migrateDatabase();
});
after(async () => {
  mock.restoreAll();
  await closeDb();
});
test("PostgreSQL applies existing migrations once, hides imported demos and keeps production inbox empty", async () => {
  await migrateDatabase();
  const db = await getDb();
  assert.equal((await db.select().from(devMails)).length, 0);
  assert.deepEqual(await readEventRegistry(), []);
  assert.deepEqual(await readPublicProjects(), []);
});
test("production email registration/login, concurrent challenge consumption, nickname and local admin identity persist", async () => {
  const email = "owner-" + randomUUID() + "@example.test";
  const result = await sendCode(email, "en", "case-owner");
  assert.ok(!JSON.stringify(result).includes(code));
  const inputCode = code;
  const outcomes = await Promise.allSettled([
    verifyCode(email, inputCode),
    verifyCode(email, inputCode),
  ]);
  assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
  const first = outcomes.find((r) => r.status === "fulfilled");
  assert.ok(first && first.status === "fulfilled");
  const original = first.value;
  assert.equal((await getUserByToken(original.token))?.id, original.user.id);
  await bootstrapAdministrator(email, "isolated-postgres-fixture");
  await closeDb();
  assert.equal((await getUserByToken(original.token))?.id, original.user.id);
  await revokeSession(original.token);
  assert.equal(await getUserByToken(original.token), null);
  assert.equal(
    (await (await getDb()).select().from(users).where(eq(users.email, email)))
      .length,
    1,
  );
});
test("failed production delivery consumes only its challenge and preserves rate quota", async () => {
  const email = "failure-" + randomUUID() + "@example.test";
  transportFailure = true;
  try {
    await assert.rejects(
      sendCode(email, "en", "failure-ip"),
      (e: unknown) => (e as { code: string }).code === "MAIL_DELIVERY_FAILED",
    );
  } finally {
    transportFailure = false;
  }
  const [challenge] = await (
    await getDb()
  )
    .select()
    .from(challenges)
    .where(eq(challenges.email, email));
  assert.ok(challenge.consumedAt);
  await assert.rejects(verifyCode(email, code));
  await assert.rejects(
    sendCode(email, "en", "failure-ip"),
    (e: unknown) => (e as { code: string }).code === "RATE_LIMITED",
  );
});
test("PostgreSQL transaction rollback and shared queue preserve all-or-nothing writes", async () => {
  const id = randomUUID(),
    email = id + "@example.test",
    db = await getDb();
  await assert.rejects(
    serializeDatabaseWrite(() =>
      db.transaction(async (tx) => {
        await tx.insert(users).values({ id, email, createdAt: new Date() });
        throw new Error("fixture rollback");
      }),
    ),
  );
  assert.equal(
    (
      await db
        .select()
        .from(users)
        .where(and(eq(users.id, id), eq(users.email, email)))
    ).length,
    0,
  );
});
