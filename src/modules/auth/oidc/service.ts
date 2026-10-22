import { randomUUID } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { getDb, serializeDatabaseWrite as write } from "../../../lib/db";
import { users, sessions } from "../schema";
import { getUserByToken, normalizeEmail } from "../service";
import { safeReturnPath } from "../return-path";
import {
  externalIdentities as identities,
  oidcFlows as flows,
  oidcSessionContexts as contexts,
  identityRecoveryApprovals as approvals,
  identityAudit as audit,
} from "./schema";
import {
  requireOidcConfig,
  FLOW_SECONDS,
  OIDC_SESSION_SECONDS,
} from "./config";
import { digest, opaque, seal, unseal, centralCsrf, match } from "./crypto";
import { OidcError } from "./errors";
import {
  beginAuthorization,
  verifyAuthorization,
  centralLogoutUrl,
} from "./provider";
import type { SdkState, VerifiedIdentity } from "./provider";
import type { PendingIdentityDto, IdentitySecurityDto } from "./contracts";
type Tx = Parameters<
  Parameters<Awaited<ReturnType<typeof getDb>>["transaction"]>[0]
>[0];
type Flow = typeof flows.$inferSelect;
export interface LoginReceipt {
  token: string;
  sessionId: string;
  userId: string;
  expiresAt: string;
  returnTo: string;
}

async function flowFor(tx: Tx, token: string | undefined) {
  const config = requireOidcConfig();
  if (!token || !/^[a-f0-9]{64}$/.test(token))
    throw new OidcError("INVALID_FLOW");
  const [flow] = await tx
    .select()
    .from(flows)
    .where(eq(flows.tokenHash, digest(token)));
  if (!flow || flow.fingerprint !== config.fingerprint)
    throw new OidcError("INVALID_FLOW");
  if (flow.expiresAt <= new Date()) throw new OidcError("EXPIRED", 410);
  return flow;
}
async function sessionGuard(tx: Tx, flow: Flow, token?: string) {
  const [session] = token
    ? await tx
        .select()
        .from(sessions)
        .where(
          and(
            eq(sessions.tokenHash, digest(token)),
            gt(sessions.expiresAt, new Date()),
          ),
        )
    : [];
  if (flow.initiatorHash) {
    if (
      !session ||
      !match(flow.initiatorHash, session.tokenHash) ||
      session.userId !== flow.targetUserId
    )
      throw new OidcError("SESSION_CHANGED", 409);
  } else if (session) throw new OidcError("SESSION_CHANGED", 409);
}
async function record(
  tx: Tx,
  action: string,
  flow: Flow,
  userId: string | null,
  detail: object = {},
) {
  await tx
    .insert(audit)
    .values({
      id: randomUUID(),
      action,
      userId,
      flowId: flow.id,
      detail: JSON.stringify(detail),
      createdAt: new Date(),
    });
}
async function receiptFor(tx: Tx, flow: Flow) {
  if (!flow.receiptCipher) throw new OidcError("INVALID_FLOW");
  const receipt = unseal<LoginReceipt>(
    flow.receiptCipher,
    "receipt:" + flow.id,
  );
  const [session] = await tx
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.id, receipt.sessionId),
        eq(sessions.tokenHash, digest(receipt.token)),
        gt(sessions.expiresAt, new Date()),
      ),
    );
  if (!session || session.userId !== receipt.userId)
    throw new OidcError("INVALID_FLOW");
  return receipt;
}
async function issue(
  tx: Tx,
  flow: Flow,
  identity: typeof identities.$inferSelect,
  proof: VerifiedIdentity,
  revokeOld: boolean,
): Promise<LoginReceipt> {
  const config = requireOidcConfig();
  const now = new Date();
  const expiresAt = new Date(
    Math.min(now.getTime() + OIDC_SESSION_SECONDS * 1000, proof.expiresAt),
  );
  if (expiresAt <= now) throw new OidcError("EXPIRED", 410);
  if (revokeOld)
    await tx.delete(sessions).where(eq(sessions.userId, identity.userId));
  const receipt: LoginReceipt = {
    token: opaque(),
    sessionId: randomUUID(),
    userId: identity.userId,
    expiresAt: expiresAt.toISOString(),
    returnTo: flow.returnTo,
  };
  await tx
    .insert(sessions)
    .values({
      id: receipt.sessionId,
      userId: identity.userId,
      tokenHash: digest(receipt.token),
      createdAt: now,
      expiresAt,
    });
  await tx
    .insert(contexts)
    .values({
      sessionId: receipt.sessionId,
      identityId: identity.id,
      fingerprint: config.fingerprint,
      idTokenCipher: seal(proof.idToken, "id-token:" + receipt.sessionId),
    });
  await tx
    .update(identities)
    .set({ lastAuthenticatedAt: now })
    .where(eq(identities.id, identity.id));
  await tx
    .update(flows)
    .set({
      status: "completed",
      sdkCipher: null,
      identityCipher: null,
      receiptCipher: seal(receipt, "receipt:" + flow.id),
    })
    .where(eq(flows.id, flow.id));
  await record(
    tx,
    revokeOld ? "identity.linked" : "identity.login",
    flow,
    identity.userId,
  );
  return receipt;
}
function checkProof(proof: VerifiedIdentity) {
  const config = requireOidcConfig();
  if (
    proof.issuer !== config.issuer ||
    !proof.subject ||
    proof.subject.length > 512 ||
    proof.expiresAt <= Date.now()
  )
    throw new OidcError("CALLBACK_REJECTED");
  return normalizeEmail(proof.email);
}

export async function startOidc(
  purpose: unknown,
  next: unknown,
  ip: string,
  browserToken?: string,
  previousFlowToken?: string,
) {
  const config = requireOidcConfig();
  if (purpose !== "login" && purpose !== "link")
    throw new OidcError("INVALID_INPUT");
  const current = await getUserByToken(browserToken);
  if (purpose === "login" && current)
    throw new OidcError("SESSION_CHANGED", 409);
  const token = opaque(),
    id = randomUUID(),
    nonce = opaque();
  const now = new Date();
  const returnPath = safeReturnPath(next);
  const returnTo =
    returnPath.startsWith("/auth/") ||
    returnPath.startsWith("/account/security")
      ? "/account"
      : returnPath;
  await write(async () =>
    (await getDb()).transaction(async (tx) => {
      const recent = await tx
        .select({ createdAt: flows.createdAt })
        .from(flows)
        .where(
          and(
            eq(flows.ipHash, digest(ip)),
            gt(flows.createdAt, new Date(now.getTime() - 3600_000)),
          ),
        );
      if (
        recent.length >= 30 ||
        recent.filter((r) => r.createdAt.getTime() > now.getTime() - 60_000)
          .length >= 6
      )
        throw new OidcError("RATE_LIMITED", 429);
      let targetUserId: string | null = null,
        expectedSubject: string | null = null;
      let initiatorHash: string | null = null;
      if (purpose === "link") {
        if (current && browserToken) {
          const [session] = await tx
            .select()
            .from(sessions)
            .where(
              and(
                eq(sessions.tokenHash, digest(browserToken)),
                gt(sessions.expiresAt, now),
              ),
            );
          if (!session || session.userId !== current.id)
            throw new OidcError("SESSION_CHANGED", 409);
          const [linked] = await tx
            .select()
            .from(identities)
            .where(
              and(
                eq(identities.userId, current.id),
                eq(identities.issuer, config.issuer),
              ),
            );
          if (linked) throw new OidcError("IDENTITY_CONFLICT", 409);
          targetUserId = current.id;
          initiatorHash = digest(browserToken);
        } else {
          const previous = await flowFor(tx, previousFlowToken);
          if (
            previous.status !== "needs_link" ||
            !previous.targetUserId ||
            !previous.expectedSubject
          )
            throw new OidcError("INVALID_FLOW");
          targetUserId = previous.targetUserId;
          expectedSubject = previous.expectedSubject;
        }
      }
      // Cancel a previous browser flow, but retain its rate-limit record.
      if (previousFlowToken)
        await tx
          .update(flows)
          .set({
            status: "cancelled",
            sdkCipher: null,
            identityCipher: null,
            receiptCipher: null,
          })
          .where(
            and(
              eq(flows.tokenHash, digest(previousFlowToken)),
              eq(flows.status, "authorizing"),
            ),
          );
      await tx
        .insert(flows)
        .values({
          id,
          tokenHash: digest(token),
          purpose,
          status: "authorizing",
          fingerprint: config.fingerprint,
          ipHash: digest(ip),
          returnTo,
          nonce,
          stateHash: "",
          targetUserId,
          expectedSubject,
          initiatorHash,
          createdAt: now,
          expiresAt: new Date(now.getTime() + FLOW_SECONDS * 1000),
        });
    }),
  );
  try {
    const authorization = await beginAuthorization(
      config,
      nonce,
      purpose === "link",
    );
    await write(async () =>
      (await getDb()).transaction(async (tx) => {
        const flow = await flowFor(tx, token);
        if (flow.status !== "authorizing") throw new OidcError("INVALID_FLOW");
        await tx
          .update(flows)
          .set({
            stateHash: digest(authorization.state),
            sdkCipher: seal(authorization.storage, "sdk:" + id),
          })
          .where(eq(flows.id, id));
      }),
    );
    return { token, url: authorization.url };
  } catch (error) {
    await write(async () => {
      await (
        await getDb()
      )
        .update(flows)
        .set({ status: "failed", sdkCipher: null })
        .where(eq(flows.id, id));
    });
    throw error;
  }
}

/** Persistence boundary: caller must be the verified SDK adapter, never request JSON. */
export async function acceptVerifiedIdentity(
  flowToken: string,
  proof: VerifiedIdentity,
  browserToken?: string,
) {
  const config = requireOidcConfig(),
    email = checkProof(proof);
  return write(async () =>
    (await getDb()).transaction(async (tx) => {
      const flow = await flowFor(tx, flowToken);
      if (flow.status !== "exchanging") throw new OidcError("INVALID_FLOW");
      await sessionGuard(tx, flow, browserToken);
      const [identity] = await tx
        .select()
        .from(identities)
        .where(
          and(
            eq(identities.issuer, proof.issuer),
            eq(identities.subject, proof.subject),
          ),
        );
      if (flow.purpose === "link") {
        if (
          !flow.targetUserId ||
          (flow.expectedSubject && flow.expectedSubject !== proof.subject) ||
          identity
        )
          throw new OidcError("IDENTITY_CONFLICT", 409);
        if (
          !proof.authenticatedAt ||
          proof.authenticatedAt < flow.createdAt.getTime() / 1000 - 30 ||
          proof.authenticatedAt < Date.now() / 1000 - 300
        )
          throw new OidcError("CALLBACK_REJECTED");
        await tx
          .update(flows)
          .set({
            status: "awaiting_approval",
            sdkCipher: null,
            expectedSubject: proof.subject,
            identityCipher: seal(proof, "identity:" + flow.id),
          })
          .where(eq(flows.id, flow.id));
        await record(
          tx,
          "identity.recovery_requested",
          flow,
          flow.targetUserId,
        );
        return null;
      }
      if (identity) {
        if (identity.trust !== config.trust)
          throw new OidcError("IDENTITY_CONFLICT", 409);
        return issue(tx, flow, identity, proof, false);
      }
      const [existing] = await tx
        .select()
        .from(users)
        .where(eq(users.email, email));
      if (existing) {
        await tx
          .update(flows)
          .set({
            status: "needs_link",
            sdkCipher: null,
            targetUserId: existing.id,
            expectedSubject: proof.subject,
          })
          .where(eq(flows.id, flow.id));
        await record(tx, "identity.email_collision", flow, null);
        return null;
      }
      const userId = randomUUID();
      await tx
        .insert(users)
        .values({ id: userId, email, createdAt: new Date() });
      const [created] = await tx
        .insert(identities)
        .values({
          id: randomUUID(),
          userId,
          issuer: proof.issuer,
          subject: proof.subject,
          trust: config.trust,
          createdAt: new Date(),
          lastAuthenticatedAt: new Date(),
        })
        .returning();
      await record(tx, "identity.created", flow, userId);
      return issue(tx, flow, created, proof, false);
    }),
  );
}

export async function finishOidc(
  callbackUrl: string,
  flowToken?: string,
  browserToken?: string,
) {
  const config = requireOidcConfig(),
    url = new URL(callbackUrl);
  if (
    url.origin !== config.origin ||
    url.pathname !== new URL(config.callback).pathname ||
    url.search.length > 8192
  )
    throw new OidcError("CALLBACK_REJECTED");
  for (const key of ["state", "code", "iss", "error"])
    if (url.searchParams.getAll(key).length > 1)
      throw new OidcError("CALLBACK_REJECTED");
  if (
    !url.searchParams.get("state") ||
    url.searchParams.has("error") ||
    (url.searchParams.has("iss") &&
      url.searchParams.get("iss") !== config.issuer)
  )
    throw new OidcError("CALLBACK_REJECTED");
  const reserved = await write(async () =>
    (await getDb()).transaction(async (tx) => {
      const flow = await flowFor(tx, flowToken);
      if (!match(flow.stateHash, digest(url.searchParams.get("state")!)))
        throw new OidcError("CALLBACK_REJECTED");
      if (flow.status === "completed")
        return { receipt: await receiptFor(tx, flow) };
      if (
        flow.status !== "authorizing" ||
        !flow.sdkCipher ||
        !url.searchParams.get("code")
      )
        throw new OidcError("INVALID_FLOW");
      await sessionGuard(tx, flow, browserToken);
      await tx
        .update(flows)
        .set({ status: "exchanging" })
        .where(eq(flows.id, flow.id));
      return { flow };
    }),
  );
  if ("receipt" in reserved) return reserved.receipt!;
  const flow = reserved.flow!;
  try {
    const proof = await verifyAuthorization(
      config,
      unseal<SdkState>(flow.sdkCipher!, "sdk:" + flow.id),
      url.href,
      flow.nonce,
      flow.purpose === "link" ? flow.createdAt : undefined,
    );
    return await acceptVerifiedIdentity(flowToken!, proof, browserToken);
  } catch (error) {
    await write(async () => {
      await (
        await getDb()
      )
        .update(flows)
        .set({ status: "failed", sdkCipher: null, identityCipher: null })
        .where(and(eq(flows.id, flow.id), eq(flows.status, "exchanging")));
    });
    throw error;
  }
}

export async function pendingOidc(
  token?: string,
): Promise<PendingIdentityDto | null> {
  requireOidcConfig();
  if (!token) return null;
  return write(async () =>
    (await getDb()).transaction(async (tx) => {
      const flow = await flowFor(tx, token);
      const [approval] = await tx
        .select()
        .from(approvals)
        .where(eq(approvals.flowId, flow.id));
      return {
        requestId: flow.id,
        status: flow.status,
        approved:
          !!approval && !approval.usedAt && approval.expiresAt > new Date(),
        expiresAt: flow.expiresAt.toISOString(),
        returnTo: flow.returnTo,
        sandbox: requireOidcConfig().trust === "local-sandbox",
      };
    }),
  );
}

/** Offline operator only. Evidence must be independently verified, never dev mail. */
export async function approveIdentityRecovery(input: {
  flowId: string;
  userId: string;
  caseId: string;
  evidenceRef: string;
  reviewedBy: string;
  acknowledgeReviewedEvidence: boolean;
}) {
  const config = requireOidcConfig();
  if (
    !input.acknowledgeReviewedEvidence ||
    ![input.caseId, input.evidenceRef, input.reviewedBy].every(
      (v) =>
        typeof v === "string" &&
        v.trim().length >= 3 &&
        v.length <= 200 &&
        !/[\u0000-\u001f]/.test(v),
    )
  )
    throw new OidcError("INVALID_INPUT");
  return write(async () =>
    (await getDb()).transaction(async (tx) => {
      const [flow] = await tx
        .select()
        .from(flows)
        .where(eq(flows.id, input.flowId));
      if (
        !flow ||
        flow.status !== "awaiting_approval" ||
        flow.targetUserId !== input.userId ||
        flow.expiresAt <= new Date() ||
        flow.fingerprint !== config.fingerprint ||
        !flow.identityCipher
      )
        throw new OidcError("INVALID_FLOW");
      const proof = unseal<VerifiedIdentity>(
        flow.identityCipher,
        "identity:" + flow.id,
      );
      checkProof(proof);
      if (proof.subject !== flow.expectedSubject)
        throw new OidcError("IDENTITY_CONFLICT", 409);
      const [prior] = await tx
        .select()
        .from(approvals)
        .where(eq(approvals.flowId, flow.id));
      if (prior) throw new OidcError("IDENTITY_CONFLICT", 409);
      await tx
        .insert(approvals)
        .values({
          id: randomUUID(),
          flowId: flow.id,
          userId: input.userId,
          issuer: proof.issuer,
          subject: proof.subject,
          caseId: input.caseId,
          evidenceRef: input.evidenceRef,
          reviewedBy: input.reviewedBy,
          createdAt: new Date(),
          expiresAt: new Date(
            Math.min(Date.now() + 300_000, flow.expiresAt.getTime()),
          ),
        });
      await record(tx, "identity.recovery_approved", flow, input.userId, {
        caseId: input.caseId,
        evidenceRef: input.evidenceRef,
        reviewedBy: input.reviewedBy,
        sandbox: config.trust === "local-sandbox",
      });
    }),
  );
}
export async function confirmIdentityRecovery(
  token: string | undefined,
  browserToken?: string,
) {
  const config = requireOidcConfig();
  return write(async () =>
    (await getDb()).transaction(async (tx) => {
      const flow = await flowFor(tx, token);
      if (flow.status === "completed") return receiptFor(tx, flow);
      await sessionGuard(tx, flow, browserToken);
      if (
        flow.status !== "awaiting_approval" ||
        !flow.identityCipher ||
        !flow.targetUserId
      )
        throw new OidcError("INVALID_FLOW");
      const proof = unseal<VerifiedIdentity>(
        flow.identityCipher,
        "identity:" + flow.id,
      );
      checkProof(proof);
      const [approval] = await tx
        .select()
        .from(approvals)
        .where(eq(approvals.flowId, flow.id));
      if (
        !approval ||
        approval.usedAt ||
        approval.expiresAt <= new Date() ||
        approval.userId !== flow.targetUserId ||
        approval.issuer !== proof.issuer ||
        approval.subject !== proof.subject ||
        flow.expectedSubject !== proof.subject
      )
        throw new OidcError("APPROVAL_REQUIRED", 409);
      const existing = await tx
        .select()
        .from(identities)
        .where(eq(identities.issuer, proof.issuer));
      if (
        existing.some(
          (i) => i.subject === proof.subject || i.userId === flow.targetUserId,
        )
      )
        throw new OidcError("IDENTITY_CONFLICT", 409);
      const [identity] = await tx
        .insert(identities)
        .values({
          id: randomUUID(),
          userId: flow.targetUserId,
          issuer: proof.issuer,
          subject: proof.subject,
          trust: config.trust,
          createdAt: new Date(),
          lastAuthenticatedAt: new Date(),
        })
        .returning();
      await tx
        .update(approvals)
        .set({ usedAt: new Date() })
        .where(eq(approvals.id, approval.id));
      return issue(tx, flow, identity, proof, true);
    }),
  );
}
export async function cancelOidc(token?: string) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return;
  await write(async () => {
    await (
      await getDb()
    )
      .update(flows)
      .set({
        status: "cancelled",
        sdkCipher: null,
        identityCipher: null,
        receiptCipher: null,
      })
      .where(eq(flows.tokenHash, digest(token)));
  });
}
export async function identitySecurity(
  token?: string,
): Promise<IdentitySecurityDto> {
  const config = requireOidcConfig(),
    user = await getUserByToken(token);
  if (!user || !token) throw new OidcError("SESSION_CHANGED", 401);
  const db = await getDb();
  const [identity] = await db
    .select()
    .from(identities)
    .where(
      and(eq(identities.userId, user.id), eq(identities.issuer, config.issuer)),
    );
  const [context] = await db
    .select()
    .from(sessions)
    .innerJoin(contexts, eq(sessions.id, contexts.sessionId))
    .where(eq(sessions.tokenHash, digest(token)));
  return {
    enabled: true,
    connected: !!identity,
    method: context ? "oidc" : "email",
    sandbox: config.trust === "local-sandbox",
    centralLogoutCsrf: context ? centralCsrf(token) : null,
  };
}
export async function logoutOidc(token: string | undefined, csrf: unknown) {
  const config = requireOidcConfig();
  if (!token || typeof csrf !== "string" || !match(csrf, centralCsrf(token)))
    throw new OidcError("INVALID_INPUT", 403);
  const idToken = await write(async () =>
    (await getDb()).transaction(async (tx) => {
      const [result] = await tx
        .select()
        .from(sessions)
        .innerJoin(contexts, eq(sessions.id, contexts.sessionId))
        .where(
          and(
            eq(sessions.tokenHash, digest(token)),
            gt(sessions.expiresAt, new Date()),
            eq(contexts.fingerprint, config.fingerprint),
          ),
        );
      if (!result) throw new OidcError("SESSION_CHANGED", 401);
      const idToken = unseal<string>(
        result.oidc_session_contexts.idTokenCipher,
        "id-token:" + result.sessions.id,
      );
      await tx.delete(sessions).where(eq(sessions.id, result.sessions.id));
      return idToken;
    }),
  );
  // Local session is already revoked even if the provider is unreachable.
  try {
    return await centralLogoutUrl(config, idToken);
  } catch {
    return config.origin + "/login?oidcError=CENTRAL_UNAVAILABLE";
  }
}
export async function cleanupOidcFlows() {
  requireOidcConfig();
  await write(async () => {
    await (
      await getDb()
    )
      .delete(flows)
      .where(lt(flows.expiresAt, new Date(Date.now() - 24 * 3600_000)));
  });
}
