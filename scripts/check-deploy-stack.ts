/** CI-only fake resource config, fixed isolated Compose project, no cloud access. */
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import path from "node:path";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  backupKey,
  encryptBackup,
  decryptBackup,
} from "../src/lib/backup-crypto";
import { restoreRuntimePermissions } from "../src/lib/restore-permissions";
async function main() {
  const envFile = path.resolve(".data/deploy-config-ci/compose.env");
  const settings = parseEnv(await readFile(envFile, "utf8"));
  if (
    settings.OSS_BUCKET !== "atox-ci-private" ||
    settings.SITE_DOMAIN !== "website.example.com"
  )
    throw new Error("Only generated CI config is accepted");
  const base = [
    "compose",
    "--project-name",
    "atox-ci-release",
    "--env-file",
    envFile,
    "-f",
    "deploy/compose.yaml",
  ];
  function docker(
    args: string[],
    input?: Buffer | string,
    allowFailure = false,
  ) {
    const result = spawnSync("docker", args, {
      input,
      stdio: ["pipe", "pipe", "pipe"],
      maxBuffer: 32 * 1024 * 1024,
    });
    if (!allowFailure && (result.error || result.status !== 0))
      throw new Error(
        "Isolated deployment command failed; private command output withheld",
      );
    return result;
  }
  function command(
    args: string[],
    input?: Buffer | string,
    allowFailure = false,
  ) {
    return docker([...base, ...args], input, allowFailure);
  }
  function sql(
    user: string,
    password: string | undefined,
    statement: string,
    database = "atox",
    allowFailure = false,
  ) {
    if (!password) throw new Error("Generated CI database password is missing");
    return command(
      [
        "exec",
        "-T",
        "-e",
        "PGPASSWORD=" + password,
        "postgres",
        "psql",
        "-X",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        user,
        "-d",
        database,
        "-tAc",
        statement,
      ],
      undefined,
      allowFailure,
    );
  }
  try {
    command(["up", "-d", "--wait", "postgres"]);
    command(["--profile", "maintenance", "run", "--rm", "migrate"]);
    assert.equal(
      sql(
        "atox_app",
        settings.APP_DB_PASSWORD,
        "select count(*) from submitted_projects",
      )
        .stdout.toString()
        .trim(),
      "12",
    );
    assert.equal(
      sql(
        "atox_app",
        settings.APP_DB_PASSWORD,
        "select usesuper from pg_user where usename=current_user",
      )
        .stdout.toString()
        .trim(),
      "f",
    );
    assert.notEqual(
      sql(
        "atox_app",
        settings.APP_DB_PASSWORD,
        "create table public.unwanted_ddl(id integer)",
        "atox",
        true,
      ).status,
      0,
    );
    const dump = command([
      "exec",
      "-T",
      "-e",
      "PGPASSWORD=" + settings.MIGRATOR_DB_PASSWORD,
      "postgres",
      "pg_dump",
      "-U",
      "atox_migrator",
      "-d",
      "atox",
      "--format=custom",
      "--no-owner",
      "--no-acl",
    ]).stdout;
    const key = backupKey(randomBytes(32).toString("hex"));
    const encrypted = encryptBackup(dump, key),
      restored = decryptBackup(encrypted, key);
    assert.ok(restored.equals(dump));
    sql(
      "atox_bootstrap",
      settings.DB_BOOTSTRAP_PASSWORD,
      "create database atox_restore_ci owner atox_migrator",
    );
    command(
      [
        "exec",
        "-T",
        "-e",
        "PGPASSWORD=" + settings.MIGRATOR_DB_PASSWORD,
        "postgres",
        "pg_restore",
        "-U",
        "atox_migrator",
        "--dbname",
        "atox_restore_ci",
        "--no-owner",
        "--no-acl",
        "--single-transaction",
        "--exit-on-error",
      ],
      restored,
    );
    sql(
      "atox_migrator",
      settings.MIGRATOR_DB_PASSWORD,
      restoreRuntimePermissions,
      "atox_restore_ci",
    );
    assert.equal(
      sql(
        "atox_app",
        settings.APP_DB_PASSWORD,
        "select count(*) from submitted_projects",
        "atox_restore_ci",
      )
        .stdout.toString()
        .trim(),
      "12",
    );
    const hash = docker([
      "run",
      "--rm",
      "caddy:2.10.2-alpine",
      "caddy",
      "hash-password",
      "--plaintext",
      "ci-only-not-real-password",
    ])
      .stdout.toString()
      .trim();
    for (const filename of ["Caddyfile.staging", "Caddyfile.production"]) {
      docker([
        "run",
        "--rm",
        "-e",
        "SITE_DOMAIN=website.example.test",
        "-e",
        "TLS_CONTACT_EMAIL=ci@example.test",
        "-e",
        "STAGING_USER=reviewer",
        "-e",
        "STAGING_PASSWORD_HASH=" + hash,
        "-v",
        path.resolve("deploy", filename) + ":/etc/caddy/Caddyfile:ro",
        "caddy:2.10.2-alpine",
        "caddy",
        "validate",
        "--config",
        "/etc/caddy/Caddyfile",
        "--adapter",
        "caddyfile",
      ]);
    }
    console.log(
      "Isolated production Compose: actual role initialization, migration, runtime non-superuser/DDL rejection, encrypted DB dump/restore/read-back and both Caddy configurations passed. No real cloud resources accessed.",
    );
  } finally {
    command(["down"], undefined, true);
  }
}
main().catch(() => {
  console.error(
    "Isolated Compose/restore validation failed; sensitive details withheld.",
  );
  process.exitCode = 1;
});
