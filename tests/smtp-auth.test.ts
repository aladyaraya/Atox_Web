import { before, after, test, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";
import { eq } from "drizzle-orm";
import { smtpConfig } from "../src/modules/auth/smtp";
import * as auth from "../src/modules/auth/service";
import {
  isDevMailEnabled,
  isEmailLoginEnabled,
} from "../src/modules/auth/mail";
import { getDb, closeDb, serializeDatabaseWrite } from "../src/lib/db";
import {
  challenges,
  devMails,
  sendEvents,
  users,
} from "../src/modules/auth/schema";

let root: string;
let body = "";
let behavior: "ok" | "fail" | "wait" = "ok";
let release: () => void;
let started: () => void;
let gate: Promise<void>;
let deliveryStarted: Promise<void>;
before(async () => {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(path.resolve(".data/mail-test"), { recursive: true });
  root = await mkdtemp(path.resolve(".data/mail-test/unit-"));
  Object.assign(process.env, {
    NODE_ENV: "development",
    MAIL_TRANSPORT: "smtp",
    ENABLE_DEV_MAIL: "true",
    ENABLE_LOGTO_LOGIN: "false",
    APP_ORIGIN: "http://127.0.0.1:3105",
    DB_PATH: path.join(root, "db"),
    AUTH_SECRET: "smtp-unit-only-secret-at-least-32-characters",
    SMTP_HOST: "smtp.qq.com",
    SMTP_PORT: "465",
    SMTP_SECURE: "true",
    SMTP_USER: "sender@example.com",
    SMTP_FROM: "sender@example.com",
    SMTP_PASSWORD: "fake-unit-password",
    MAIL_TEST_RECIPIENT: "recipient@example.com",
    MAIL_TEST_ALLOW_ANY_RECIPIENT: "false",
  });
  mock.method(
    nodemailer,
    "createTransport",
    (options: {
      logger: boolean;
      debug: boolean;
      tls: { rejectUnauthorized: boolean };
    }) => {
      assert.equal(options.logger, false);
      assert.equal(options.debug, false);
      assert.equal(options.tls.rejectUnauthorized, true);
      return {
        sendMail: async (mail: { text: string; to: string }) => {
          body = mail.text;
          if (behavior === "wait") {
            started();
            await gate;
          }
          if (behavior === "fail")
            throw new Error("provider error containing private content");
          return { accepted: [mail.to] };
        },
        close() {},
      };
    },
  );
});
after(async () => {
  mock.restoreAll();
  await closeDb();
  if (!root.startsWith(path.resolve(".data/mail-test") + path.sep))
    throw new Error("Refusing cleanup outside SMTP sandbox");
  await rm(root, { recursive: true });
});

const hasCode = (code: string) => (e: unknown) =>
  (e as { code: string }).code === code;
async function reset() {
  const db = await getDb();
  await db.delete(challenges);
  await db.delete(sendEvents);
}
test("SMTP is local-only, fails closed, never exposes a development inbox", () => {
  assert.ok(isEmailLoginEnabled());
  assert.equal(isDevMailEnabled(), false);
  for (const patch of [
    { NODE_ENV: "production" },
    { ENABLE_LOGTO_LOGIN: "true" },
    { DB_PATH: ".data/pglite" },
    { APP_ORIGIN: "https://example.com" },
    { SMTP_PASSWORD: "" },
    { SMTP_SECURE: "false" },
  ])
    assert.equal(smtpConfig({ ...process.env, ...patch }), null);
});
test("Website SMTP is explicit, loopback-only and preserves the selected private data directory", () => {
  const website = {
    ...process.env,
    MAIL_LOCAL_SCOPE: "website",
    ENABLE_DEV_MAIL: "false",
    DB_PATH: path.resolve(".data/website/db"),
  };
  assert.equal(smtpConfig(website)?.allowAnyRecipient, true);
  assert.equal(smtpConfig(website)?.scope, "website");
  for (const change of [
    { ENABLE_DEV_MAIL: "true" },
    { NODE_ENV: "production" },
    { APP_ORIGIN: "http://external.example.test" },
    { DB_PATH: path.resolve("outside-db") },
    { MAIL_LOCAL_SCOPE: "unknown" },
  ])
    assert.equal(smtpConfig({ ...website, ...change }), null);
  const sharedRoot = path.resolve("../other-local-website/.data");
  assert.ok(
    smtpConfig({
      ...website,
      MAIL_WEBSITE_DATA_ROOT: sharedRoot,
      DB_PATH: path.join(sharedRoot, "db"),
    }),
  );
  assert.equal(
    smtpConfig({
      ...website,
      MAIL_WEBSITE_DATA_ROOT: sharedRoot,
      DB_PATH: path.join(sharedRoot, "../outside"),
    }),
    null,
  );
});

test("Real transport contract registers and reuses an account without plaintext persistence", async () => {
  await reset();
  const response = await auth.sendCode("recipient@example.com", "en", "local");
  const code = body.match(/\b\d{6}\b/)![0];
  assert.equal(JSON.stringify(response).includes(code), false);
  assert.match(body, /10 minutes/);
  const first = await auth.verifyCode("recipient@example.com", code);
  const db = await getDb();
  assert.equal((await db.select().from(devMails)).length, 0);
  await assert.rejects(
    auth.verifyCode("recipient@example.com", code),
    hasCode("INVALID_CODE"),
  );
  await auth.revokeSession(first.token);
  assert.equal(await auth.getUserByToken(first.token), null);
  await reset();
  await auth.sendCode("recipient@example.com", "zh", "local");
  const second = await auth.verifyCode(
    "recipient@example.com",
    body.match(/\b\d{6}\b/)![0],
  );
  assert.equal(first.user.id, second.user.id);
  assert.equal((await db.select().from(users)).length, 1);
  await assert.rejects(
    auth.sendCode("other@example.com", "zh", "local"),
    hasCode("MAIL_RECIPIENT_NOT_ALLOWED"),
  );
});
test("Delivery failure invalidates the exact code, preserves rate limit, and sanitizes errors", async () => {
  await reset();
  behavior = "fail";
  await assert.rejects(
    auth.sendCode("recipient@example.com", "zh", "local"),
    (e: unknown) => {
      assert.equal((e as Error).message.includes("private content"), false);
      return hasCode("MAIL_DELIVERY_FAILED")(e);
    },
  );
  assert.ok((await (await getDb()).select().from(challenges))[0].consumedAt);
  await assert.rejects(
    auth.verifyCode("recipient@example.com", body.match(/\b\d{6}\b/)![0]),
    hasCode("INVALID_CODE"),
  );
  await assert.rejects(
    auth.sendCode("recipient@example.com", "zh", "local"),
    hasCode("RATE_LIMITED"),
  );
  behavior = "ok";
});
test("SMTP network waits do not hold the shared write coordinator", async () => {
  await reset();
  behavior = "wait";
  gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  deliveryStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  const send = auth.sendCode("recipient@example.com", "zh", "local");
  await deliveryStarted;
  try {
    await Promise.race([
      serializeDatabaseWrite(async () => {
        await (await getDb()).select().from(users);
      }),
      new Promise((_, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Queue blocked")),
          2000,
        );
        timer.unref();
      }),
    ]);
  } finally {
    release();
    await send;
    behavior = "ok";
  }
  const [row] = await (
    await getDb()
  )
    .select()
    .from(challenges)
    .where(eq(challenges.email, "recipient@example.com"));
  assert.equal(row.consumedAt, null);
});

test("Opt-in accepts different domains, keeps invalid-address checks and service limits", async () => {
  await reset();
  process.env.MAIL_TEST_ALLOW_ANY_RECIPIENT = "true";
  try {
    assert.ok(smtpConfig({ ...process.env, MAIL_TEST_RECIPIENT: "" }));
    assert.equal(smtpConfig({ ...process.env, NODE_ENV: "production" }), null);
    assert.equal(
      smtpConfig({ ...process.env, ENABLE_LOGTO_LOGIN: "true" }),
      null,
    );
    assert.equal(smtpConfig({ ...process.env, DB_PATH: ".data/pglite" }), null);
    const ids = new Set<string>();
    for (const address of [
      "participant@gmail.com",
      "participant@163.com",
      "participant@outlook.com",
    ]) {
      const response = await auth.sendCode(
        `  ${address.toUpperCase()}  `,
        "zh",
        "local",
      );
      assert.equal(response.ok, true);
      const result = await auth.verifyCode(
        address,
        body.match(/\b\d{6}\b/)![0],
      );
      assert.equal(result.user.email, address);
      ids.add(result.user.id);
      await assert.rejects(
        auth.sendCode(address, "zh", "local"),
        hasCode("RATE_LIMITED"),
      );
    }
    assert.equal(ids.size, 3);
    await assert.rejects(
      auth.sendCode("invalid", "zh", "local"),
      hasCode("INVALID_EMAIL"),
    );
    await assert.rejects(
      auth.sendCode("participant@gmail.com,another.example", "zh", "local"),
      hasCode("INVALID_EMAIL"),
    );
    assert.equal((await (await getDb()).select().from(devMails)).length, 0);
  } finally {
    process.env.MAIL_TEST_ALLOW_ANY_RECIPIENT = "false";
  }
  await assert.rejects(
    auth.sendCode("participant@gmail.com", "zh", "local"),
    hasCode("MAIL_RECIPIENT_NOT_ALLOWED"),
  );
});

test("Daily website SMTP logs into the existing user ID without creating an inbox or replacing the database", async () => {
  const keys = ["MAIL_LOCAL_SCOPE", "ENABLE_DEV_MAIL", "APP_ORIGIN"];
  const saved = keys.map((key) => process.env[key]);
  try {
    Object.assign(process.env, {
      MAIL_LOCAL_SCOPE: "website",
      ENABLE_DEV_MAIL: "false",
      APP_ORIGIN: "http://localhost:3000",
    });
    const db = await getDb();
    await reset();
    await auth.sendCode("daily@example.test", "zh", "daily-one");
    const first = await auth.verifyCode(
      "daily@example.test",
      body.match(/\b\d{6}\b/)![0],
    );
    await reset();
    await auth.sendCode("daily@example.test", "en", "daily-two");
    const second = await auth.verifyCode(
      "daily@example.test",
      body.match(/\b\d{6}\b/)![0],
    );
    assert.equal(second.user.id, first.user.id);
    assert.equal((await auth.getUserByToken(first.token))?.id, first.user.id);
    assert.equal(
      (
        await db
          .select()
          .from(users)
          .where(eq(users.email, "daily@example.test"))
      ).length,
      1,
    );
    assert.equal((await db.select().from(devMails)).length, 0);
  } finally {
    keys.forEach((key, index) => {
      if (saved[index] === undefined) delete process.env[key];
      else process.env[key] = saved[index];
    });
  }
});
