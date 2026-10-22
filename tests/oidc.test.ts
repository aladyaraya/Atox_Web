import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID, generateKeyPairSync, sign, createHash } from "node:crypto";
import { createServer } from "node:http";
import { canonicalCallback } from "../src/modules/auth/oidc/http";
import { and, eq, sql } from "drizzle-orm";
import { getDb, closeDb } from "../src/lib/db";
import {
  getOidcConfig,
  requireOidcConfig,
} from "../src/modules/auth/oidc/config";
import { opaque, digest, seal, unseal } from "../src/modules/auth/oidc/crypto";
import {
  acceptVerifiedIdentity,
  approveIdentityRecovery,
  confirmIdentityRecovery,
  pendingOidc,
  cancelOidc,
  finishOidc,
  startOidc,
  identitySecurity,
} from "../src/modules/auth/oidc/service";
import {
  oidcFlows,
  externalIdentities,
  identityRecoveryApprovals,
  identityAudit,
} from "../src/modules/auth/oidc/schema";
import { users, sessions, devMails } from "../src/modules/auth/schema";
import { accountProfiles } from "../src/modules/auth/profile-schema";
import {
  sendCode,
  verifyCode,
  getUserByToken,
  revokeSession,
} from "../src/modules/auth/service";
import type { VerifiedIdentity } from "../src/modules/auth/oidc/provider";
import {
  beginAuthorization,
  verifyAuthorization,
} from "../src/modules/auth/oidc/provider";
let directory: string;
const rejects = (code: string) => (e: unknown) => {
  assert.equal((e as { code: string }).code, code);
  return true;
};
before(async () => {
  const root = path.resolve(".data/oidc-sandbox");
  await mkdir(root, { recursive: true });
  directory = await mkdtemp(path.join(root, "unit-"));
  Object.assign(process.env, {
    NODE_ENV: "development",
    ENABLE_LOGTO_LOGIN: "true",
    APP_ORIGIN: "http://127.0.0.1:3104",
    LOGTO_ENDPOINT: "http://127.0.0.1:3301",
    LOGTO_ISSUER: "http://127.0.0.1:3301/oidc",
    LOGTO_APP_ID: "unit-client",
    LOGTO_APP_SECRET: "unit-client-secret",
    OIDC_ENCRYPTION_SECRET: opaque(),
    AUTH_SECRET: opaque(),
    OIDC_EMAIL_TRUST: "local-sandbox",
    DB_PATH: path.join(directory, "db"),
    ENABLE_DEV_MAIL: "true",
  });
  await getDb();
});
after(async () => {
  await closeDb();
  if (
    directory &&
    path.dirname(directory) === path.resolve(".data/oidc-sandbox")
  )
    await rm(directory, { recursive: true, force: true });
});
function proof(
  subject = opaque(),
  email = subject + "@example.test",
): VerifiedIdentity {
  return {
    issuer: requireOidcConfig().issuer,
    subject,
    email,
    idToken: "unit-verified-token-not-a-real-jwt",
    expiresAt: Date.now() + 3600_000,
    authenticatedAt: Math.floor(Date.now() / 1000),
  };
}
async function flow(
  purpose: "login" | "link" = "login",
  targetUserId?: string,
  initiatorHash?: string,
) {
  const db = await getDb(),
    token = opaque(),
    id = randomUUID();
  await db.insert(oidcFlows).values({
    id,
    tokenHash: digest(token),
    purpose,
    status: "exchanging",
    fingerprint: requireOidcConfig().fingerprint,
    ipHash: opaque(),
    returnTo: "/events/demo/materials",
    nonce: opaque(),
    stateHash: digest("fixture-state"),
    targetUserId,
    initiatorHash,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 600_000),
  });
  return { id, token };
}
async function oldAccount() {
  const db = await getDb(),
    id = randomUUID(),
    email = id + "@example.test",
    token = opaque();
  await db.insert(users).values({ id, email, createdAt: new Date() });
  await db.insert(sessions).values({
    id: randomUUID(),
    userId: id,
    tokenHash: digest(token),
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 86400_000),
  });
  await db.insert(accountProfiles).values({
    userId: id,
    nickname: "Preserved owner",
    revision: 1,
    updatedAt: new Date(),
  });
  return { id, email, token };
}
async function approve(f: { id: string }, userId: string) {
  return approveIdentityRecovery({
    flowId: f.id,
    userId,
    caseId: "isolated-unit-case",
    evidenceRef: "synthetic-independent-proof",
    reviewedBy: "unit-operator",
    acknowledgeReviewedEvidence: true,
  });
}

test("OIDC production/disabled guards and sandbox cannot use business DB or nonlocal mail", () => {
  const env = { ...process.env };
  assert.equal(getOidcConfig({ ...env, NODE_ENV: "production" }), null);
  assert.equal(getOidcConfig({ ...env, ENABLE_LOGTO_LOGIN: "false" }), null);
  assert.throws(
    () => getOidcConfig({ ...env, DB_PATH: ".data/pglite" }),
    rejects("DISABLED"),
  );
  assert.throws(
    () =>
      getOidcConfig({
        ...env,
        LOGTO_ENDPOINT: "https://id.example.test",
        LOGTO_ISSUER: "https://id.example.test/oidc",
      }),
    rejects("DISABLED"),
  );
  assert.throws(
    () => getOidcConfig({ ...env, OIDC_EMAIL_TRUST: "verified-email" }),
    rejects("DISABLED"),
  );
  assert.throws(
    () => getOidcConfig({ ...env, OIDC_ENCRYPTION_SECRET: env.AUTH_SECRET }),
    rejects("DISABLED"),
  );
});
test("Next internal hostname is canonicalized only after checking the exact public callback host, scheme and path", () => {
  const config = requireOidcConfig();
  const valid = new Request(
    "http://localhost:3104/api/auth/oidc/callback?state=fixture-state&code=fixture-code",
    { headers: { host: "127.0.0.1:3104" } },
  );
  assert.equal(
    canonicalCallback(valid, config),
    config.callback + "?state=fixture-state&code=fixture-code",
  );
  for (const input of [
    new Request(valid.url),
    new Request(valid.url, { headers: { host: "attacker.invalid" } }),
    new Request("https://localhost:3104/api/auth/oidc/callback", {
      headers: { host: "127.0.0.1:3104" },
    }),
    new Request("http://localhost:3104/not-callback", {
      headers: { host: "127.0.0.1:3104" },
    }),
  ])
    assert.throws(
      () => canonicalCallback(input, config),
      rejects("CALLBACK_REJECTED"),
    );
});
test("flow encryption is authenticated and purpose-separated", () => {
  const value = seal({ secret: "private" }, "purpose-a");
  assert.deepEqual(unseal(value, "purpose-a"), { secret: "private" });
  assert.throws(() => unseal(value, "purpose-b"), rejects("INVALID_FLOW"));
  assert.throws(
    () => unseal(value.slice(0, -4) + "AAAA", "purpose-a"),
    rejects("INVALID_FLOW"),
  );
});
test("verified new identity creates local user and unchanged AuthUser, then exact sub reuses id even when email changes", async () => {
  const f = await flow(),
    p = proof(),
    first = await acceptVerifiedIdentity(f.token, p);
  assert.ok(first);
  const user = await getUserByToken(first.token);
  assert.ok(user);
  assert.deepEqual(Object.keys(user).sort(), ["createdAt", "email", "id"]);
  assert.equal(user.id, first.userId);
  assert.equal(user.email, p.email);
  const second = await acceptVerifiedIdentity((await flow()).token, {
    ...p,
    email: "changed@example.test",
  });
  assert.equal(second?.userId, first.userId);
  assert.equal((await getUserByToken(second?.token))?.email, p.email);
  assert.equal((await identitySecurity(second?.token)).method, "oidc");
});
test("same email pauses without mapping, local session or modifying old profile", async () => {
  const old = await oldAccount(),
    f = await flow(),
    db = await getDb();
  assert.equal(
    await acceptVerifiedIdentity(f.token, proof(undefined, old.email)),
    null,
  );
  const pending = await pendingOidc(f.token);
  assert.equal(pending?.status, "needs_link");
  assert.ok(!JSON.stringify(pending).includes(old.id));
  assert.equal(
    (
      await db
        .select()
        .from(externalIdentities)
        .where(eq(externalIdentities.userId, old.id))
    ).length,
    0,
  );
  assert.equal((await getUserByToken(old.token))?.id, old.id);
  const [profile] = await db
    .select()
    .from(accountProfiles)
    .where(eq(accountProfiles.userId, old.id));
  assert.equal(profile.nickname, "Preserved owner");
});
test("link requires fresh authentication plus independent approval; atomic confirmation preserves id and revokes legacy sessions", async () => {
  const old = await oldAccount(),
    f = await flow("link", old.id, digest(old.token)),
    p = proof();
  await acceptVerifiedIdentity(f.token, p, old.token);
  await assert.rejects(
    confirmIdentityRecovery(f.token, old.token),
    rejects("APPROVAL_REQUIRED"),
  );
  await approve(f, old.id);
  assert.equal((await pendingOidc(f.token))?.approved, true);
  const results = await Promise.all([
    confirmIdentityRecovery(f.token, old.token),
    confirmIdentityRecovery(f.token, old.token),
  ]);
  assert.equal(results[0].userId, old.id);
  assert.equal(results[0].token, results[1].token);
  const switched = await oldAccount();
  await assert.rejects(
    confirmIdentityRecovery(f.token, switched.token),
    rejects("SESSION_CHANGED"),
  );
  assert.equal(await getUserByToken(old.token), null);
  assert.equal((await getUserByToken(results[0].token))?.id, old.id);
  const db = await getDb(),
    links = await db
      .select()
      .from(externalIdentities)
      .where(eq(externalIdentities.userId, old.id));
  assert.equal(links.length, 1);
  const logs = await db
    .select()
    .from(identityAudit)
    .where(
      and(
        eq(identityAudit.flowId, f.id),
        eq(identityAudit.action, "identity.linked"),
      ),
    );
  assert.equal(logs.length, 1);
  await revokeSession(results[0].token);
  await assert.rejects(
    confirmIdentityRecovery(f.token),
    rejects("INVALID_FLOW"),
  );
});
test("dev inbox OTP cannot bypass a linked identity, even with feature disabled", async () => {
  const f = await flow(),
    p = proof(),
    receipt = await acceptVerifiedIdentity(f.token, p);
  assert.ok(receipt);
  await sendCode(p.email, "en", opaque());
  const [mail] = await (
    await getDb()
  )
    .select()
    .from(devMails)
    .where(eq(devMails.email, p.email));
  const code = mail.body.match(/\b\d{6}\b/)![0];
  process.env.ENABLE_LOGTO_LOGIN = "false";
  try {
    await assert.rejects(verifyCode(p.email, code), rejects("OIDC_REQUIRED"));
    assert.equal(await getUserByToken(receipt.token), null);
  } finally {
    process.env.ENABLE_LOGTO_LOGIN = "true";
  }
});
test("stale authentication, wrong issuer/subject and session switching are rejected", async () => {
  const old = await oldAccount(),
    other = await oldAccount(),
    f = await flow("link", old.id, digest(old.token));
  await assert.rejects(
    acceptVerifiedIdentity(
      f.token,
      { ...proof(), authenticatedAt: 1 },
      old.token,
    ),
    rejects("CALLBACK_REJECTED"),
  );
  await assert.rejects(
    acceptVerifiedIdentity(
      f.token,
      { ...proof(), issuer: "https://other.invalid/oidc" },
      old.token,
    ),
    rejects("CALLBACK_REJECTED"),
  );
  await assert.rejects(
    acceptVerifiedIdentity(f.token, proof(), other.token),
    rejects("SESSION_CHANGED"),
  );
  await acceptVerifiedIdentity(f.token, proof(), old.token);
  await approve(f, old.id);
  await assert.rejects(
    confirmIdentityRecovery(f.token, other.token),
    rejects("SESSION_CHANGED"),
  );
  assert.equal((await getUserByToken(old.token))?.id, old.id);
});
test("expired approvals cannot bind, and identity/user-issuer uniqueness prevents reassignment", async () => {
  const old = await oldAccount(),
    f = await flow("link", old.id),
    p = proof();
  await acceptVerifiedIdentity(f.token, p);
  await approve(f, old.id);
  await (
    await getDb()
  )
    .update(identityRecoveryApprovals)
    .set({ expiresAt: new Date(0) })
    .where(eq(identityRecoveryApprovals.flowId, f.id));
  await assert.rejects(
    confirmIdentityRecovery(f.token),
    rejects("APPROVAL_REQUIRED"),
  );
  const newLogin = await acceptVerifiedIdentity((await flow()).token, p);
  assert.ok(newLogin);
  await (
    await getDb()
  )
    .update(identityRecoveryApprovals)
    .set({ expiresAt: new Date(Date.now() + 60000) })
    .where(eq(identityRecoveryApprovals.flowId, f.id));
  await assert.rejects(
    confirmIdentityRecovery(f.token),
    rejects("IDENTITY_CONFLICT"),
  );
});
test("concurrent exact identity logins share one user and do not duplicate identity", async () => {
  const p = proof(),
    a = await flow(),
    b = await flow();
  const results = await Promise.all([
    acceptVerifiedIdentity(a.token, p),
    acceptVerifiedIdentity(b.token, p),
  ]);
  assert.equal(results[0]?.userId, results[1]?.userId);
  assert.equal(
    (
      await (
        await getDb()
      )
        .select()
        .from(externalIdentities)
        .where(eq(externalIdentities.subject, p.subject))
    ).length,
    1,
  );
});
test("audit failure rolls back identity, approval consumption and session replacement", async () => {
  const old = await oldAccount(),
    f = await flow("link", old.id),
    db = await getDb();
  await acceptVerifiedIdentity(f.token, proof());
  await approve(f, old.id);
  await db.execute(
    sql.raw(
      "CREATE FUNCTION reject_identity_audit() RETURNS trigger AS $$ BEGIN IF NEW.action = 'identity.linked' THEN RAISE EXCEPTION 'test rollback'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;",
    ),
  );
  await db.execute(
    sql.raw(
      "CREATE TRIGGER reject_identity_audit BEFORE INSERT ON identity_audit FOR EACH ROW EXECUTE FUNCTION reject_identity_audit();",
    ),
  );
  try {
    await assert.rejects(confirmIdentityRecovery(f.token));
  } finally {
    await db.execute(
      sql.raw("DROP TRIGGER reject_identity_audit ON identity_audit;"),
    );
    await db.execute(sql.raw("DROP FUNCTION reject_identity_audit();"));
  }
  assert.equal((await getUserByToken(old.token))?.id, old.id);
  assert.equal(
    (
      await db
        .select()
        .from(externalIdentities)
        .where(eq(externalIdentities.userId, old.id))
    ).length,
    0,
  );
  assert.equal((await pendingOidc(f.token))?.approved, true);
});
test("invalid callback, cross-client state, cancellation, expiry and fingerprint changes fail closed", async () => {
  const f = await flow(),
    url = requireOidcConfig().callback;
  await assert.rejects(
    finishOidc(url + "?state=forged&code=forged", f.token),
    rejects("CALLBACK_REJECTED"),
  );
  await assert.rejects(
    finishOidc(url + "?state=a&state=b&code=x", f.token),
    rejects("CALLBACK_REJECTED"),
  );
  await assert.rejects(
    finishOidc(url + "?state=a&code=x&iss=https://other.invalid", f.token),
    rejects("CALLBACK_REJECTED"),
  );
  await cancelOidc(f.token);
  await assert.rejects(
    acceptVerifiedIdentity(f.token, proof()),
    rejects("INVALID_FLOW"),
  );
  const expired = await flow();
  await (
    await getDb()
  )
    .update(oidcFlows)
    .set({ expiresAt: new Date(0) })
    .where(eq(oidcFlows.id, expired.id));
  await assert.rejects(pendingOidc(expired.token), rejects("EXPIRED"));
  const newFlow = await flow();
  process.env.OIDC_SESSION_VERSION = "2";
  try {
    await assert.rejects(pendingOidc(newFlow.token), rejects("INVALID_FLOW"));
  } finally {
    delete process.env.OIDC_SESSION_VERSION;
  }
});
test("server start rate records cannot be bypassed by cancelled flows", async () => {
  const db = await getDb(),
    ip = "rate-case";
  for (let i = 0; i < 6; i++) {
    const f = await flow();
    await db
      .update(oidcFlows)
      .set({ ipHash: digest(ip), status: "cancelled" })
      .where(eq(oidcFlows.id, f.id));
  }
  await assert.rejects(
    startOidc("login", "https://attacker.invalid", ip),
    rejects("RATE_LIMITED"),
  );
});
test("unexpired OIDC/local users persist across restart; config revocation affects OIDC only", async () => {
  const old = await oldAccount(),
    receipt = await acceptVerifiedIdentity((await flow()).token, proof());
  assert.ok(receipt);
  await closeDb();
  assert.equal((await getUserByToken(receipt.token))?.id, receipt.userId);
  process.env.OIDC_SESSION_VERSION = "rotated";
  try {
    assert.equal(await getUserByToken(receipt.token), null);
    assert.equal((await getUserByToken(old.token))?.id, old.id);
  } finally {
    delete process.env.OIDC_SESSION_VERSION;
  }
});

test("official SDK verifies a signed isolated provider response, PKCE, nonce and callback state", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const key = {
    ...publicKey.export({ format: "jwk" }),
    kid: "isolated-key",
    use: "sig",
    alg: "RS256",
  };
  let providerOrigin = "",
    nonce = "",
    challenge = "",
    wrongNonce = false;
  const server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/oidc/.well-known/openid-configuration") {
      res.end(
        JSON.stringify({
          issuer: providerOrigin + "/oidc",
          authorization_endpoint: providerOrigin + "/oidc/auth",
          token_endpoint: providerOrigin + "/oidc/token",
          userinfo_endpoint: providerOrigin + "/oidc/me",
          jwks_uri: providerOrigin + "/oidc/jwks",
          end_session_endpoint: providerOrigin + "/oidc/session/end",
          revocation_endpoint: providerOrigin + "/oidc/token/revocation",
          response_types_supported: ["code"],
          subject_types_supported: ["public"],
          id_token_signing_alg_values_supported: ["RS256"],
          token_endpoint_auth_methods_supported: ["client_secret_basic"],
        }),
      );
      return;
    }
    if (req.url === "/oidc/jwks") {
      res.end(JSON.stringify({ keys: [key] }));
      return;
    }
    if (req.url === "/oidc/token") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const form = new URLSearchParams(body);
      const actual = createHash("sha256")
        .update(form.get("code_verifier") ?? "")
        .digest("base64url");
      if (actual !== challenge || form.get("code") !== "isolated-code") {
        res.writeHead(400).end('{"error":"invalid_grant"}');
        return;
      }
      const header = Buffer.from(
        JSON.stringify({ alg: "RS256", kid: "isolated-key", typ: "JWT" }),
      ).toString("base64url");
      const claims = Buffer.from(
        JSON.stringify({
          iss: providerOrigin + "/oidc",
          sub: "isolated-subject",
          aud: "unit-client",
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
          nonce: wrongNonce ? "wrong-nonce" : nonce,
          email: "provider@example.test",
          email_verified: true,
          auth_time: Math.floor(Date.now() / 1000),
        }),
      ).toString("base64url");
      const payload = header + "." + claims;
      res.end(
        JSON.stringify({
          access_token: "isolated-access",
          token_type: "Bearer",
          expires_in: 3600,
          id_token:
            payload +
            "." +
            sign("RSA-SHA256", Buffer.from(payload), privateKey).toString(
              "base64url",
            ),
          scope: "openid email",
        }),
      );
      return;
    }
    res.writeHead(404).end("{}");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  providerOrigin = "http://127.0.0.1:" + address.port;
  const config = {
    ...requireOidcConfig(),
    endpoint: providerOrigin,
    issuer: providerOrigin + "/oidc",
  };
  try {
    nonce = opaque();
    const authorization = await beginAuthorization(config, nonce, false);
    challenge = new URL(authorization.url).searchParams.get("code_challenge")!;
    const callback =
      config.callback +
      "?code=isolated-code&state=" +
      encodeURIComponent(authorization.state);
    const verified = await verifyAuthorization(
      config,
      authorization.storage,
      callback,
      nonce,
    );
    assert.equal(verified.subject, "isolated-subject");
    assert.equal(verified.email, "provider@example.test");
    nonce = opaque();
    const next = await beginAuthorization(config, nonce, false);
    challenge = new URL(next.url).searchParams.get("code_challenge")!;
    wrongNonce = true;
    await assert.rejects(
      verifyAuthorization(
        config,
        { ...next.storage },
        config.callback +
          "?code=isolated-code&state=" +
          encodeURIComponent(next.state),
        nonce,
      ),
      rejects("CALLBACK_REJECTED"),
    );
    await assert.rejects(
      verifyAuthorization(
        config,
        { ...next.storage },
        config.callback + "?code=isolated-code&state=forged",
        nonce,
      ),
      rejects("CALLBACK_REJECTED"),
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
