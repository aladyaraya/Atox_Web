import { spawn } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import OSS from "ali-oss";
import {
  backupKey,
  encryptBackup,
  decryptBackup,
} from "../src/lib/backup-crypto";
import { Pool } from "pg";
import { restoreRuntimePermissions } from "../src/lib/restore-permissions";

function config() {
  const url = new URL(process.env.DATABASE_URL || "");
  const key = backupKey(process.env.BACKUP_ENCRYPTION_KEY);
  if (
    process.env.DATABASE_DRIVER !== "postgres" ||
    !process.env.BACKUP_BUCKET ||
    process.env.BACKUP_BUCKET === process.env.OSS_BUCKET ||
    !process.env.BACKUP_ACCESS_KEY_ID ||
    !process.env.BACKUP_ACCESS_KEY_SECRET
  )
    throw new Error();
  const client = new OSS({
    region: process.env.OSS_REGION || "oss-cn-hongkong",
    bucket: process.env.BACKUP_BUCKET,
    accessKeyId: process.env.BACKUP_ACCESS_KEY_ID,
    accessKeySecret: process.env.BACKUP_ACCESS_KEY_SECRET,
    secure: true,
    timeout: 120000,
  });
  return { url, key, client };
}
function tool(
  command: string,
  args: string[],
  url: URL,
  input?: Buffer,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: {
        ...process.env,
        PGHOST: url.hostname,
        PGPORT: url.port || "5432",
        PGDATABASE: url.pathname.slice(1),
        PGUSER: decodeURIComponent(url.username),
        PGPASSWORD: decodeURIComponent(url.password),
        PGSSLMODE: url.searchParams.get("sslmode") || "prefer",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const chunks: Buffer[] = [];
    let size = 0,
      failed = false;
    child.stdout.on("data", (chunk) => {
      size += chunk.length;
      if (size > 512 * 1024 * 1024) {
        failed = true;
        child.kill();
      } else chunks.push(chunk);
    });
    child.stderr.resume();
    child.on("error", () => reject(new Error("PostgreSQL backup tool failed")));
    child.on("close", (code) => {
      if (code || failed)
        reject(new Error("Backup/restore failed or exceeded 512MiB budget"));
      else resolve(Buffer.concat(chunks));
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}
async function main() {
  const { url, key, client } = config(),
    action = process.argv[2];
  if (action === "create") {
    const dump = await tool(
      "pg_dump",
      ["--format=custom", "--no-owner", "--no-acl"],
      url,
    );
    const encrypted = encryptBackup(dump, key),
      stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const object = `backups/${stamp}-${randomUUID()}.pgdump.enc`;
    await client.put(object, encrypted, {
      headers: {
        "x-oss-object-acl": "private",
        "x-oss-forbid-overwrite": "true",
      },
    });
    const result = await client.get(object);
    const restored = decryptBackup(Buffer.from(result.content), key);
    if (!restored.equals(dump))
      throw new Error("Backup read-back verification failed");
    console.log(
      JSON.stringify({
        status: "verified",
        key: object,
        bytes: encrypted.length,
        sha256: createHash("sha256").update(encrypted).digest("hex"),
        release: process.env.RELEASE_ID,
      }),
    );
    return;
  }
  if (action === "restore") {
    const object = process.argv[3],
      database = url.pathname.slice(1);
    if (
      !/^backups\/[a-zA-Z0-9-]+\.pgdump\.enc$/.test(object || "") ||
      !/^atox_restore_[a-z0-9_]+$/.test(database) ||
      process.env.RESTORE_ACK !== "empty-isolated-database-only"
    )
      throw new Error(
        "Restore requires an isolated empty atox_restore_* database",
      );
    const pool = new Pool({ connectionString: url.href });
    try {
      const { rows } = await pool.query(
        "select count(*)::int as count from pg_tables where schemaname not in ('pg_catalog','information_schema')",
      );
      if (rows[0].count !== 0) throw new Error("Restore target is not empty");
    } finally {
      await pool.end();
    }
    const objectResult = await client.get(object);
    // Authenticate the complete ciphertext BEFORE letting pg_restore execute SQL.
    const dump = decryptBackup(Buffer.from(objectResult.content), key);
    await tool(
      "pg_restore",
      [
        "--dbname",
        database,
        "--no-owner",
        "--no-acl",
        "--single-transaction",
        "--exit-on-error",
      ],
      url,
      dump,
    );
    const permissions = new Pool({ connectionString: url.href });
    try {
      await permissions.query(restoreRuntimePermissions);
    } finally {
      await permissions.end();
    }
    console.log(
      "Isolated database restore finished. Verify business rows and matching immutable object files before promotion.",
    );
    return;
  }
  throw new Error("Use create or restore <backup key>");
}
main().catch(() => {
  console.error(
    "Backup/restore operation failed. No credentials or dump contents logged. Check configuration, retention and isolated target.",
  );
  process.exitCode = 1;
});
