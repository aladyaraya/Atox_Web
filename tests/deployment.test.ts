import { after, test, mock } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";
import OSS from "ali-oss";
import {
  productionMailConfig,
  deliverProductionMail,
} from "../src/modules/auth/production-mail";
import { checkDeployment } from "../src/lib/deployment";
import {
  putPrivateFile,
  readPrivateFile,
  removePrivateFile,
  listPrivateFiles,
  objectStorageConfig,
} from "../src/lib/private-storage";
import {
  backupKey,
  encryptBackup,
  decryptBackup,
} from "../src/lib/backup-crypto";
const environment: Record<string, string> = {
  NODE_ENV: "production",
  DEPLOYMENT_MODE: "production",
  APP_ORIGIN: "https://website.example.test",
  AUTH_SECRET: randomBytes(32).toString("hex"),
  DATABASE_DRIVER: "postgres",
  DATABASE_URL: "postgresql://fixture.invalid/atox",
  DATABASE_AUTO_MIGRATE: "false",
  ENABLE_DEV_MAIL: "false",
  ENABLE_LOGTO_LOGIN: "false",
  ENABLE_TICKETING_PREVIEW: "false",
  MAIL_TRANSPORT: "transactional-smtp",
  MAIL_DOMAIN_VERIFIED: "true",
  SMTP_HOST: "smtpdm-ap-southeast-1.aliyuncs.com",
  SMTP_PORT: "465",
  SMTP_SECURE: "true",
  SMTP_USER: "no-reply@example.test",
  SMTP_FROM: "no-reply@example.test",
  SMTP_PASSWORD: "synthetic-fixture-only",
  STORAGE_DRIVER: "oss",
  OSS_REGION: "oss-cn-hongkong",
  OSS_BUCKET: "atox-test-private",
  OSS_PREFIX: "fixture/",
  OSS_ACCESS_KEY_ID: "synthetic-key",
  OSS_ACCESS_KEY_SECRET: "synthetic-key-secret",
  RELEASE_ID: "1234567890abcdef",
  TRUST_PROXY: "true",
  LAUNCH_APPROVED: "true",
};
async function withEnvironment<T>(
  env: Record<string, string | undefined>,
  fn: () => Promise<T>,
) {
  const saved = new Map(Object.keys(env).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(env))
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  try {
    return await fn();
  } finally {
    for (const [k, v] of saved)
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
  }
}
after(() => mock.restoreAll());
test("production login requires an explicitly verified TLS sender and safe production mode", () => {
  assert.ok(productionMailConfig(environment));
  assert.deepEqual(checkDeployment(environment), []);
  for (const change of [
    { NODE_ENV: "development" },
    { DEPLOYMENT_MODE: "verification" },
    { SMTP_SECURE: "false" },
    { SMTP_PORT: "25" },
    { MAIL_DOMAIN_VERIFIED: "false" },
    { ENABLE_DEV_MAIL: "true" },
    { ENABLE_LOGTO_LOGIN: "true" },
    { ENABLE_TICKETING_PREVIEW: "true" },
    { DATABASE_DRIVER: "pglite" },
    { APP_ORIGIN: "http://website.example.test" },
    { APP_ORIGIN: "https://localhost" },
    { SMTP_FROM: "different@example.test" },
  ])
    assert.equal(productionMailConfig({ ...environment, ...change }), null);
  assert.ok(
    checkDeployment({ ...environment, LAUNCH_APPROVED: "false" }).includes(
      "OWNER_LAUNCH_APPROVAL_REQUIRED",
    ),
  );
  assert.ok(
    checkDeployment({ ...environment, DATABASE_AUTO_MIGRATE: "true" }).includes(
      "OFFLINE_MIGRATIONS_REQUIRED",
    ),
  );
  assert.equal(
    objectStorageConfig({ ...environment, STORAGE_DRIVER: "local" }),
    null,
  );
  assert.throws(() =>
    objectStorageConfig({ ...environment, OSS_PREFIX: "../unsafe/" }),
  );
});
test("production transport verifies certificates, exposes no OTP response, and never downgrades failures", async () => {
  let fail = false,
    closed = 0;
  const mocked = mock.method(
    nodemailer,
    "createTransport",
    (options: {
      secure: boolean;
      tls: { rejectUnauthorized: boolean };
      logger: boolean;
    }) => {
      assert.equal(options.secure, true);
      assert.equal(options.tls.rejectUnauthorized, true);
      assert.equal(options.logger, false);
      return {
        sendMail: async (mail: { to: string; text: string }) => {
          assert.equal(mail.text, "private body");
          if (fail) throw new Error("sensitive provider error");
          return { accepted: [mail.to] };
        },
        close: () => closed++,
      };
    },
  );
  try {
    await withEnvironment(environment, async () => {
      assert.equal(
        await deliverProductionMail(
          "recipient@example.test",
          "subject",
          "private body",
        ),
        undefined,
      );
      fail = true;
      await assert.rejects(
        deliverProductionMail(
          "recipient@example.test",
          "subject",
          "private body",
        ),
        (error: unknown) => {
          assert.equal(
            (error as { code: string }).code,
            "MAIL_DELIVERY_FAILED",
          );
          assert.ok(!String(error).includes("sensitive"));
          return true;
        },
      );
      assert.equal(closed, 2);
    });
  } finally {
    mocked.mock.restore();
  }
});
test("local storage remains private and preserves existing file namespace", async () => {
  const root = path.resolve(".data/m016-storage-tests");
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(path.join(root, "case-"));
  try {
    await withEnvironment(
      {
        STORAGE_DRIVER: "local",
        DEPLOYMENT_MODE: "verification",
        UPLOAD_PATH: directory,
      },
      async () => {
        const name = randomUUID() + ".pdf";
        await putPrivateFile("events", name, Buffer.from("private"));
        assert.equal(
          (await readPrivateFile("events", name)).toString(),
          "private",
        );
        await assert.rejects(readPrivateFile("projects", name));
        assert.equal((await listPrivateFiles("events")).length, 1);
        await assert.rejects(
          putPrivateFile("events", name, Buffer.from("overwrite")),
        );
        await assert.rejects(
          putPrivateFile("events", "../escape.pdf", Buffer.from("x")),
        );
        await removePrivateFile("events", name);
        assert.equal((await listPrivateFiles("events")).length, 0);
      },
    );
  } finally {
    if (path.dirname(directory) === root)
      await rm(directory, { recursive: true, force: true });
  }
});
test("OSS adapter uses private immutable scoped keys and retains recovery objects", async () => {
  const objects = new Map<string, Buffer>(),
    name = randomUUID() + ".pdf";
  const put = mock.method(
    OSS.prototype,
    "put",
    async (
      key: string,
      value: Buffer,
      options: { headers: Record<string, string> },
    ) => {
      assert.equal(options.headers["x-oss-object-acl"], "private");
      assert.equal(options.headers["x-oss-forbid-overwrite"], "true");
      assert.ok(!objects.has(key));
      objects.set(key, value);
      return {};
    },
  );
  const get = mock.method(OSS.prototype, "get", async (key: string) => {
    const content = objects.get(key);
    if (!content) throw new Error();
    return { content };
  });
  const del = mock.method(OSS.prototype, "delete", async () => {
    throw new Error("Physical deletion must not be attempted");
  });
  try {
    await withEnvironment(environment, async () => {
      await putPrivateFile("projects", name, Buffer.from("private PDF"));
      assert.equal(
        (await readPrivateFile("projects", name)).toString(),
        "private PDF",
      );
      await assert.rejects(readPrivateFile("events", name));
      await removePrivateFile("projects", name);
      assert.equal(
        (await readPrivateFile("projects", name)).toString(),
        "private PDF",
      );
      assert.equal(del.mock.callCount(), 0);
    });
  } finally {
    put.mock.restore();
    get.mock.restore();
    del.mock.restore();
  }
});
test("backup envelope authenticates all contents before restore, rejects wrong keys and tampering", () => {
  const key = backupKey(randomBytes(32).toString("hex")),
    data = Buffer.from("synthetic database backup");
  const encoded = encryptBackup(data, key);
  assert.ok(!encoded.includes(data));
  assert.deepEqual(decryptBackup(encoded, key), data);
  const tampered = Buffer.from(encoded);
  tampered[22] ^= 1;
  assert.throws(() => decryptBackup(tampered, key));
  assert.throws(() => decryptBackup(encoded, randomBytes(32)));
  assert.throws(() => backupKey("not-a-key"));
  assert.throws(() => decryptBackup(Buffer.from("partial"), key));
});
