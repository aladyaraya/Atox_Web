import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, closeDb } from "../src/lib/db";
import {
  sendCode,
  verifyCode,
  getUserByToken,
} from "../src/modules/auth/service";
import { devMails, sendEvents, sessions } from "../src/modules/auth/schema";
import {
  externalIdentities,
  oidcSessionContexts,
} from "../src/lib/legacy-identity-schema";

let directory: string;
before(async () => {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(path.resolve(".data"), { recursive: true });
  directory = await mkdtemp(path.resolve(".data/core-identity-"));
  Object.assign(process.env, {
    NODE_ENV: "development",
    DB_PATH: path.join(directory, "db"),
    MAIL_TRANSPORT: "dev",
    ENABLE_DEV_MAIL: "true",
    AUTH_SECRET: "core-identity-test-only-secret-at-least-32-characters",
  });
});
after(async () => {
  await closeDb();
  assert.equal(path.dirname(directory), path.resolve(".data"));
  await rm(directory, { recursive: true });
});
test("Extracting the identity module preserves bindings, rejects its sessions and cannot downgrade account ownership", async () => {
  const email = "historical-binding@example.test";
  await sendCode(email, "en", "first");
  const db = await getDb();
  let [mail] = await db
    .select()
    .from(devMails)
    .where(eq(devMails.email, email));
  const original = await verifyCode(email, mail.body.match(/\b\d{6}\b/)![0]);
  assert.equal((await getUserByToken(original.token))?.id, original.user.id);
  const identityId = randomUUID();
  await db
    .insert(externalIdentities)
    .values({
      id: identityId,
      userId: original.user.id,
      issuer: "https://old-provider.example.test",
      subject: randomUUID(),
      trust: "verified-email",
      createdAt: new Date(),
      lastAuthenticatedAt: new Date(),
    });
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.userId, original.user.id));
  await db
    .insert(oidcSessionContexts)
    .values({
      sessionId: session.id,
      identityId,
      fingerprint: "old",
      idTokenCipher: "synthetic-unread-cipher",
    });
  assert.equal(await getUserByToken(original.token), null);
  await db.delete(sendEvents).where(eq(sendEvents.email, email));
  await sendCode(email, "en", "second");
  [mail] = (
    await db.select().from(devMails).where(eq(devMails.email, email))
  ).slice(-1);
  await assert.rejects(
    verifyCode(email, mail.body.match(/\b\d{6}\b/)![0]),
    (e: unknown) => (e as { code: string }).code === "OIDC_REQUIRED",
  );
  assert.equal(
    (await db.select().from(externalIdentities))[0].userId,
    original.user.id,
  );
});
